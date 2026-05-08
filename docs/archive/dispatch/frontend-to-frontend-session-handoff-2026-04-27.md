# Frontend → Frontend: End-of-Session Handoff (2026-04-27)

- **Date:** 2026-04-27
- **From:** frontend (outgoing session, Claude Opus 4.7)
- **To:** frontend (incoming session)
- **Type:** handoff
- **Status:** session closing in good condition; nine PRs merged
  this session; one open (PR #13 awaiting merge at write time);
  no outstanding action items required of the user.
- **Suggested filing:** `docs/dispatch/frontend-to-frontend-session-handoff-2026-04-27.md`
  per ADR-0005's dispatch ledger convention.

## Closed milestones

This session closed nine work units, mostly on a single coherent
"code health to release-readiness" arc. Each landed on its own
branch with a PR — the user adopted that workflow at C2.2 and
asked to keep it. Each PR has a worklog entry under
`docs/worklog/`; read those for the substantive history.

In chronological order:

| PR / commit | Topic | Worklog |
|---|---|---|
| `8eeb701` (direct-to-main, pre-PR-pattern) | C2.1 — extract `useResizablePanel` | `2026-04-27-c2.1-extract-use-resizable-panel.md` |
| #5 | C2.2 — extract `useDirtyBoardGuard` (folds in `LoadAction` widening + silent-guard cleanup) | `2026-04-27-c2.2-extract-use-dirty-board-guard.md` |
| #6 | C2.3 — extract `useAppBootstrap`; closes the C2 arc within bounded scope | `2026-04-27-c2.3-extract-use-app-bootstrap.md` |
| #7 | B5 finalization — identity-aware SyncService (closes a real ADR-0002 data-loss bug surfaced during smoke) | `2026-04-27-b5-finalization-identity-aware-sync.md` |
| #8 | Auth-lifecycle UX — LoginModal auto-open + workspace wipe on logout | `2026-04-27-auth-lifecycle-ux.md` |
| #9 | TODO #28 — JWT 401 silent retry + auth-state drift bridge (lessons captured) | `2026-04-27-todo-28-jwt-401-retry.md` |
| #10 | Store schema versioning + hydrate-migration framework (closes auditor's #2) | `2026-04-27-store-schema-versioning.md` |
| #11 | Frontend de-branding round 1 — store migration `1 → 2` (theme/cardset/palette) | `2026-04-27-debranding-round-1-store-migration.md` |
| #12 | Frontend de-branding round 2 — file rename, localStorage compat shim, source comments, doc prose | `2026-04-27-debranding-round-2.md` |
| #13 | Top-level error boundary (closes auditor's #5) — *open at write time* | `2026-04-27-root-error-boundary.md` |

App.vue went from 593 → 500 lines via three clean composable
extractions; no further extraction is recommended (remaining
clusters are thin per the C2 closing analysis). The schema-
versioning framework's first migration (1→2) has shipped; the
registry has one entry. The auth UX surface is materially
complete — identity-aware persistence, modal auto-open on
rejection/logout, workspace wipe, identity-honest 401 retry,
api-client → useAuth state-bridge — closing the entire B5
arc that the prior session had named.

## Meta-work shipped this session

Three documentation surfaces evolved:

- **`docs/worklog/`** — established as a new genre during the C1
  fix at the start of the session. Approved plan-mode
  deliberations are filed at execute time. The audit-bound
  dispatch proposing the discipline lives at
  `docs/dispatch/frontend-to-audit-formalize-planned-work-logging.md`
  (in flight; awaiting audit-side acknowledgment). Every PR
  this session shipped with a worklog entry; the pattern is
  load-bearing for the session's auditability.

- **RFC-0001** — extended with two new open questions:
  - **#8 (ADR language vs practiced posture)** — added during
    the C2 deliberation about whether ADR-0007's ≤250-line
    target is a flag or a ceiling. The validity audit should
    benchmark each ADR's language against practiced posture.
  - **#9 (runtime-state SSOT coverage in Layer 1)** — added
    during the auth-state drift fix in PR #9. The auth pair
    (api-client JWT vs `useAuth.state`) is the worked example;
    the detection heuristic and remediation patterns are
    documented inline. ADR-0005 Rule 1 ("single source of
    truth per nominal handle") was authored about
    documentation; question 9 says it applies to runtime
    state too.

- **`docs/notes/auditor-notes.md`** — items #2 and #5 retired
  in-place per the ledger discipline; their headings stay as
  historical record.

## State of the codebase (snapshots worth knowing)

- **App.vue:** 500 lines. Three composables extracted
  (`useResizablePanel`, `useDirtyBoardGuard`,
  `useAppBootstrap`). The C2 arc closed within bounded scope
  — remaining clusters are thin and don't earn their keep as
  standalone composables. Documented in
  `2026-04-27-c2.3-extract-use-app-bootstrap.md`'s
  "Bounded-stopping evaluation" section.
- **Schema versioning:** `CURRENT_SCHEMA_VERSION = 2`.
  `migrations[0]` is the de-branding 1→2 (theme/cardset/
  palette identifier renames). Append-only invariant
  documented in `frontend/src/store/migrations.ts`.
- **Auth lifecycle:** identity-aware sync; modal auto-open on
  rejection/logout; workspace wipe on identity loss (engine
  state intentionally preserved per the deployment-model-
  dependent reasoning); identity-honest 401 retry that uses
  `login(cachedUsername)` not `ensureAuthenticated()` to
  avoid silent identity substitution; api-client → useAuth
  callback bridge so non-`/auth/*` 401s flip `auth.state`
  correctly.
- **De-branding:** frontend complete. Backend-side entries
  (`X-Ebisu-Token`, `.ebisu_secret_key`, `ebisu.db`) are
  out of frontend scope; backend's PR.
  `EbisuModel`/`EbisuRecallKey`/`fetchEbisuSession` preserved
  as algorithm-correct domain references per the TODO's
  preservation note.
- **Error boundary:** `RootErrorBoundary.vue` wraps App.vue's
  root content; `app.config.errorHandler` in main.ts is the
  backstop. Closes the white-screen failure mode.

## Pending — apply queue

Nothing requires user action between sessions. PR #13 is
awaiting merge at write time (likely merged before the
incoming session reads this).

## Open observations and follow-ons

### Deferred items (`docs/notes/deferred-items.md`)

- **ADR-effectiveness audits** — RFC-0001 now covers this; the
  entry references the RFC as the formal home.
- **Serial numbers on compiler-generated artifacts** — RFC-
  shaped concern; awaiting the user's prioritization.
- **App.vue refactoring queue** — App.vue is now 500 lines
  (down from 591); no longer in the "red flag" tier per
  ADR-0007. Other entries in the queue
  (`HorizontalTimelineVisualizer.vue`, `useReviewSession.ts`,
  `PaletteEditor.vue`, `BaseChart.vue`, `MintCardModal.vue`)
  are unchanged.
- **Engine connection lifecycle on logout** — deployment-
  model-dependent; revisit when user-keyed-endpoint
  deployment (cloud-compute, rented per-user KataGo) arrives.
- **Tags-fetch hydration race in useAppBootstrap** — pre-
  existing; benign in practice. Logged for future cleanup.
- **Legacy auth-key compat shim removal** — added during
  PR #12's de-branding round 2. The shim in
  `api-client.ts::migrateLegacyAuthKeys()` is intentionally
  bounded-and-scheduled-for-removal per ADR-0002 exception
  #3. Remove in a future cleanup PR once monitoring
  confirms no users carry legacy keys.

### Active TODO entries (`docs/TODO.md`)

The frontend-side TODO has shrunk substantially. What remains
in the active tier (frontend-only):

- **34b-cleanup**: ~10 lines after `npm run gen:api`; pure
  housekeeping in the ACL.
- **Tighten `useVariationPath` to `Ref<NodeId[]>`** — ~5
  lines.
- **Type the pipeline DSL on the frontend** — adopt the
  generated discriminated union in `CardSet.pipeline`.
- **Merge `CardCreatePayload` with generated `CardCreate`**
  — adopt the generated type at call sites.

Backend-only entries (out of frontend scope):
13–16, 23–26 (tenancy spine), 30c, 30d (CTE consolidation),
plus three backend de-branding entries (`X-Ebisu-Token`,
`.ebisu_secret_key`, `ebisu.db`).

### Frontend backlog (`docs/notes/frontend-backlog.md`)

UI/UX items not in the canonical TODO. The user explicitly
flagged **`useUserIORegistry` × Monaco keybinding clash** as
a blocker for editor use. Other items: PV hover-annotation
suppression; disconnect-button styling; analysis-range
preservation across tabs/boards; SR ↔ analysis-tab
independence; click-chart-in-intermission after SR rewind.
Plus features: card editor, ownership/policy overlay, PV
mouse-scroll + paste-to-tree, KataGo `query_version` /
`query_models` on (re)connect → status bar, open-games tab
manager.

### Spec-driven, multi-session

`docs/notes/card-tree-frontend-spec.md` describes a
substantial widget evolution (active/context/stub/bucket
roles, progressive disclosure on top of `LineageTreeChart.vue`).
Standalone arc; not release-blocking.

## Critical meta-lessons retained from session

These surfaced during this session and are worth keeping for
the next:

### "Always promote, never collision-guard" in migrations

PR #11's first version had defensive collision-guards
(`!cardSets.default`, `!('quality_delta' in symbols)`) that
turned out to harm — `deepMerge` between fresh defaults
(containing the new identifier as a template) and the migrated
blob produced apparent collisions even when neither side
carried real user customizations. The guards skipped the
rename, leaving stale keys persisted across saves.

**Principle**: defensive collision-guards in migrations should
ask "is the destination something the user might have
*intentionally* created" — not "is the destination *somehow*
present in the input." If auto-generated by the system,
always promote. The lesson lives in
`2026-04-27-debranding-round-1-store-migration.md`'s
"Mid-execution lesson" section; the migration's code carries
a comment pointing at it.

### Architectural drift vs planning failure (RFC-0001 question 9)

The auth-state drift fix in PR #9 was initially framed (by
me) as a planning gap — "I should have walked every 401 path."
The user reframed it correctly as architectural drift:
**convention-only alignment between two physical
representations of one nominal handle**. ADR-0005 Rule 1
("single source of truth per nominal handle") was authored
about documentation; the same risk applies to runtime state.

When growing consumers of state X, ask: "are there paths that
mutate X without going through its owner?" If yes, the
alignment is conventional and will drift. The fix is identity-
aware bridges (callback / event / single-owner) — not version
counters (which solve concurrency, a different concern).

### `.vue` files in explore-agent grep

PR #12's Phase-1 explore reported the file rename's blast
radius as 13 sites; the first build failed on the 14th in
`ForestDirectory.vue`. The explore tool's grep didn't include
`.vue` files by default. Future renames: explicitly include
`*.vue` in the grep pattern, or trust the build to catch
missed sites loudly.

### Diagnose at the right layer

The "version counter as paranoid guardrails" discussion in PR
#9 was a good worked example. The user's instinct (defense in
depth) was right; the *layer* was wrong (version counters
solve concurrency, not identity ownership). When debugging,
ask first: is this a concurrency problem (multiple writers,
conflict detection) or an ownership problem (whose data is in
my reactive store)? Concurrency wants ETags; ownership wants
identity-keyed state. Conflating the two leads to over-
engineered patches that don't close the failure mode.

### The user's collaboration style

- **Branch + PR per work unit.** Adopted at C2.2; cleaner
  than direct-to-main; auditable. Stick with it.
- **Plan mode for substantive changes.** The user values the
  pre-execution deliberation; surface trade-offs explicitly,
  don't pick silently. ADR-0004 minimal-touch and ADR-0007
  bounded-scope discipline are practiced — match it.
- **Honest pushback.** They appreciate it. The "machine-level
  vs user-level" framing for engine preservation was sloppy
  on my part; they reframed it correctly. Engage with their
  reframings — they're often more accurate than my first
  framing.
- **Hands-on smoke testing.** They corrupt the JWT in
  console, plant synthetic blobs, dump store state. Don't
  shy from suggesting console-pasteable diagnostic recipes;
  they'll run them.
- **Dev server stays running.** Use HMR; don't recommend
  restarts unless necessary.
- **Tone:** methodical, deferential to existing structure,
  no flattery, no emoji. Match the codebase's personality
  per the auditor's first-entry advice.
- **They're a non-programmer but architecturally astute.**
  Direct via prose, but trust their architectural intuitions.
  The drift reframe was theirs.

## Resumption protocol

To resume cleanly, the incoming session should:

1. Read this dispatch.
2. Read `docs/handoff-current.md` for the umbrella orientation
   (still accurate; minor file references updated this session).
3. Skim the worklog entries from this session in chronological
   order (the C2 → B5 → auth-lifecycle → schema-versioning →
   de-branding → error-boundary arc is connected).
4. Check `docs/notes/auditor-notes.md` for current auditor
   state. The user noted that audit "now seems to have become
   the go-to for anything beyond the usual" — keep audit-bound
   dispatches focused; consider RFC-0001 question additions
   for cross-cutting concerns instead.
5. Check `docs/notes/deferred-items.md` for in-flight
   observations.
6. Check `docs/dispatch/` for any audit responses that arrive
   before resumption.
7. Confirm `npm run build` is green on `main`.

## What's likely next

The user named release-readiness as the framing this afternoon:
"once the few parts that remain of the feature side are
finished, I'll be itching to release the project." Code health
is in good shape after PR #13. Likely next targets:

- **`useUserIORegistry` × Monaco keybinding clash** — flagged
  as a blocker for editor use in `frontend-backlog.md`. If
  release is in sight, this is the next pragmatic item.
- **Other backlog polish items** — disconnect-button styling,
  PV hover annotation, analysis-range preservation, etc.
- **Card-tree widget per `card-tree-frontend-spec.md`** —
  substantial feature. Probably not release-blocking unless
  the user wants it shipped together.

The user typically directs explicitly; offer a menu rather
than picking silently.

## Reply

No reply required from the incoming session unless something
in this dispatch reads as inaccurate after first orientation.
If a contradiction surfaces with a worklog or with the actual
code, surface it — wisdom accumulates only if it stays honest.

Hand off in good condition.
