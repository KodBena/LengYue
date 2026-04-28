# Release Scope — Locked

- **Date:** 2026-04-28
- **Status:** Locked. This document is the punch list for the
  next release. No items are added without an explicit decision
  by the project author. The project commits to ship after every
  item below is closed, with the single exception named in
  "Project commitment" below.
- **Genre:** Project-level scope freeze. Sibling to
  `docs/TODO.md` (which lists active and queued work in
  general); this document is the *subset* of TODO that gates
  release.
- **Retires when:** all locked items are merged, a release tag
  is cut, and a retrospective document replaces this one. Per
  ADR-0005 Rule 7, the retirement plan is named here so the
  document does not outlive its purpose.

## Locked items

The release ships when these five are merged and verified.
Order is suggested-not-strict; items can be interleaved.

### 1. Backend de-branding finalisation

Three remaining entries from `docs/TODO.md`'s "Trivial — string
substitutions" tier. Each is a small, scoped rename with a
documented compat-shim approach where existing local installs
hold state under the old name.

- **`X-Ebisu-Token` HTTP header** (`backend/core/config.py:86`).
  Audit usage first — `API_TOKEN_NAME` may be vestigial since
  the auth flow uses Bearer JWT (`get_current_user_id` reads
  `Authorization`). If unused, remove the constant. If used,
  rename to `X-Auth-Token` with a frontend lockstep update.
- **`.ebisu_secret_key` → `./.jwt_secret`**
  (`backend/core/config.py:85`). Startup compat: if the old
  file exists and the new one does not, rename on disk before
  reading. One small block in `core/security.py`. Avoids
  invalidating in-flight JWTs.
- **`ebisu.db` → `./cards.db`** (or `./lengyue.db`;
  `backend/core/config.py:72`). Same compat-shim shape: if
  `DATABASE_URI` resolves to a missing file but the legacy
  `ebisu.db` exists in the same directory, rename it before
  opening. Prevents data loss for existing local installs.

Doc updates land alongside each rename: `docs/notes/tenancy.md:254`
for the secret-key path, `backend/README.md:62` for the
database example, `docs/playbooks/monorepo/monorepo-plan.md:232,240`
for the inventory references, and the TODO's own
Completed-table reference at `docs/TODO.md:66`.

### 2. Analysis-range preservation across tab/board switches

Per `docs/notes/frontend-backlog.md` (the project author's own
self-flagged "highly annoying" entry). Today the analysis
range resets when switching between Analysis / SR / Database
tabs or between open boards. The release expectation is that
the range persists per-board (or per-context — scope decision
deferred to the implementation session). Frontend-only.

### 3. Card-tree widget

Implementation per `docs/notes/card-tree-frontend-spec.md` (288
lines, the SoT). Substantial multi-session arc; the spec
describes active / context / stub / bucket roles and
progressive disclosure on top of `LineageTreeChart.vue`. The
backend half is at `docs/notes/card-tree-backend-spec.md` and
coordinates via the spec.

### 4. Pass handling in the KataGo wire + save-to-disk for SGFs

Two items naturally bundled because both touch SGF
serialisation surfaces.

- **Pass handling.** The engine's wire translation does not
  currently round-trip a pass move correctly to KataGo's
  expected representation. Bug-shaped; small but load-bearing
  for any game that contains a pass.
- **Save-to-disk.** Affordance to export the current board /
  game / tree as an SGF file. UX-shaped; addresses the
  long-standing "the user has built up a tree of analysis,
  has no way to take it home" gap.

### 5. Default palette

Per `docs/dispatch/frontend-to-frontend-default-palette-metrics-spec.md`
(open). Two parts:

- **Part 0 — atomic regression fix.** The current seed's
  `visit_ratio` symbol calls `uservisits` (function does not
  exist); proxy stdlib provides `_uservisits`. One-line
  rename. Must ship even if everything else gets re-scoped.
- **Part 1+ — curated metric set.** Replace the under-
  developed seed with a curated set covering common axes of
  MCTS-derived position analysis. The spec is "deliberately
  broader than the final seed to give the user genuine
  choice"; review-and-cull happens before merge.

## Project commitment

The project commits to release after these five items are
merged and verified, with one exception:

**Critical bugs that are blatantly blockers** (data loss,
unrecoverable state, security-shaped, build-broken) may force
additional fixes to land before release. These are not scope
expansions — they are forced corrections to keep the locked
scope shippable.

Anything else — feature requests, UX polish items,
architectural follow-ups, refactor debt, test coverage,
hosted-deployment-shaped items — is **out of scope for this
release** and may land in a successor release.

## Specifically excluded (recorded so they are not re-discussed)

- **Cold-start seeding for new cards** (auditor's #10).
  Discovering what works should be a community effort; not
  pre-release work.
- **Test suite.** No commitment to add tests before release.
  The composable layer is the natural starting point for
  whoever picks this up post-release.
- **PaletteEditor.vue extraction** (ADR-0007 budget
  violation). Acknowledged debt; not blocking. Lands when the
  file is touched again under ADR-0007's "incremental, not a
  sweep" posture.
- **`gradingParameter` typing** (handoff "Rough edges" +
  auditor's #9). Acknowledged debt; not a release blocker.
  Address when the inner shapes stabilise or when a touch-site
  forces the audit.
- **Hosted-deployment-shaped auditor items.** Export / import /
  delete (auditor's #1), password reset (#3), auth rate
  limiting (#4), health endpoint (#6), JWT revocation (#7),
  version banner (#11). These matter only if the deployment
  target shifts from local-install to hosted. The current
  release is local-install-shaped; these items remain visible
  in `docs/notes/auditor-notes.md` for a future hosted-release
  arc.
- **Tenancy spine completion** (TODO items 13–16, 23–26).
  Backend multi-tenant read-path filtering and schema
  migrations. Required for hosted deployment; not for
  local-install. Stays in TODO; not in release scope.
- **Analysis persistence** (`docs/notes/analysis-persistence-plan.md`).
  Performance feature; not release-blocking.
- **qEUBO genre transition** of `docs/notes/qEUBO.md` from
  `living-doc` to `design-note: implemented`. One-line edit
  pending the end-to-end UI smoke; tracked in the qEUBO note's
  own status table. Not a release blocker.

## Cross-references

- `docs/TODO.md` — full work ledger. The five locked items
  exist in the TODO; this document promotes them to release
  scope and binds the project to ship after they close.
- `docs/handoff-current.md` "Where the project is going" — the
  pre-freeze roadmap remains the long-horizon view; this
  document is the short-horizon punch list.
- `docs/notes/auditor-notes.md` — observations whose
  prioritisation deferred to post-release.
- `docs/notes/frontend-backlog.md` — UI/UX items not in the
  release scope; visible for post-release prioritisation.

## Authoring

This document records a commitment made by the project author
on 2026-04-28, transcribed from session conversation. The list
of locked items is closed. Adding an item requires the
project author to make the addition explicitly; LLM
contributors must not silently expand the scope, even if a
touched site appears to invite a related fix.

If a session needs an item added, surface the request and wait
for sign-off — the same posture ADR-0004 names for partial
visibility, applied here to scope rather than to file content.
