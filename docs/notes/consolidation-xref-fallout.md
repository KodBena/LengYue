# Consolidation cross-reference fallout — TODO.md / deferred-items.md / handoff-current.md

Status: working artifact, produced 2026-06-02 in an isolated worktree
(branch `bork/docs/consolidation-xref-fallout`), deliberately **not** on the
work-status SSOT branch — a liveness audit was running concurrently against
the main tree and must see it untouched. This inventories the cross-references
that must be resolved when the three status-bearing prose docs surrender their
work-status to the SSOT, and it sharpens one distinction the maintainer
flagged: **handoff-current.md is not the same kind of document as the other
two.**

## Method & scope

- **Inbound references** were taken from the committed doc-graph manifest
  (`docs/doc-graph.json` — every `to == <target>` edge), then split into
  **live** vs **frozen** (`docs/archive/**` and `docs/worklog/**`).
- **Frozen references are out of scope.** Per the orientation note's standing
  rule — *"Internal references point at paths as they existed at each file's
  capture moment; do not edit to fix"* — archive and completed-worklog
  references to these docs are expected, tolerated drift. They are counted
  below and then set aside.
- Concrete referencing lines in the live entry-point docs were read directly
  (`CLAUDE.md`, `README.md`, `FEATURES.md`, the `CLAUDE.md` tree, `FILES.md`,
  the onboarding notes).
- The edge kind is uniformly `path-mention` (prose path references; no
  markdown-link or curated `## Related` edges point at these three).

## Headline finding: three docs, two kinds

| Doc | What it is | Inbound: live / frozen | Endgame |
|---|---|---|---|
| `docs/TODO.md` | work-tracker (scheduled work) | 24 / 46 | becomes a **projection** of the SSOT (or is retired) |
| `docs/notes/deferred-items.md` | work-tracker (working-memory ledger) | 12 / 23 | **status delegated** to the SSOT (kept as prose, or retired) |
| `docs/handoff-current.md` | **orientation hub** (pedagogy + system state) | 28 / 17 | **refactored in place**, *not* removed |

The asymmetry is the whole point. `TODO.md` and `deferred-items.md` are
work-trackers — their *substance* is work-status, so consolidation moves that
substance into the SSOT and their inbound references re-point to it. **`handoff-
current.md` is an orientation document whose work-status is only one slice**:
its live referencers are dominated by entry-point docs (`README.md`,
`FEATURES.md`, all three `CLAUDE.md`, `FILES.md`, all four onboarding notes)
citing it for *orientation and pedagogy*, not for work-status. Deleting it
would break the orientation spine; the right move is to **strip/delegate its
status assertions to the SSOT and keep the orientation content** — i.e.
refactor, possibly with the current file archived and a slimmer successor
authored.

The fallout therefore depends on the *disposition* chosen per doc, so each
section below is conditioned on that, not on a blanket "removal."

---

## `docs/TODO.md` — 24 live referencers

**Live referencers, by role:**
- **Entry-point / load-bearing:** `CLAUDE.md` (the "documentation is part of
  the work" audit — see the dedicated section below), `docs/onboarding/
  orientation.md` ("Active and queued work, sorted by implementation
  complexity"), `docs/onboarding/{frontend,backend}.md`.
- **Live notes / consults / audits (contextual mentions — "logged in /
  promoted to TODO.md"):** `decisions-deferred.md`, `auditor-notes.md`,
  `audit-reflections.md`, `rca-discipline-lapses-2026-06-01.md`, the two
  `opus-consult-2026-06-02-work-status-*` records, `work-status-ssot-plan.md`,
  `documentation-graph-artifact-plan.md`, `typed-effect-documentation-plan.md`,
  `release-retrospective-2026-05.md`, `frontend-test-coverage-2026-05.md`,
  `test-coverage-2026-05.md`, the two `responsive-design-audit-*` notes,
  `handoff-current.md`, `deferred-items.md`.
- **Quasi-frozen (treat like archive):** `docs/playbooks/monorepo/*` (executed
  playbooks, reference-only), `docs/dispatch/proxy-to-proxy-post-v1.0.13-
  followups.md` (closed dispatch).

**Resolution, by disposition:**
- **If TODO.md is kept as a generated projection** (the design's lean; CLAUDE.md
  line 77 already says *"a machine-readable work-status SSOT, of which
  `TODO.md` becomes a projection"*): the path `docs/TODO.md` still resolves, so
  **most references survive untouched**. The only edits are where prose says
  *hand-edit* TODO ("add to / promote to / update TODO.md") — that language
  must move to "update the SSOT (`docs/work-status.json`); TODO.md is its
  projection." Primary site: CLAUDE.md's audit (below).
- **If TODO.md is retired entirely:** all 24 live referencers re-point to the
  SSOT / its query tool. Higher churn; not recommended given the projection
  path is cheap and preserves the refs.

## `docs/notes/deferred-items.md` — 12 live referencers

**Live referencers:** `CLAUDE.md` (audit + the doc-graph-SVG deferral mentions,
lines 72/97/113), `docs/TODO.md`, `docs/handoff-current.md`,
`audit-stringly-typed-contracts-2026-06-01.md`, `auditor-notes.md`,
`documentation-graph-artifact-plan.md`, the two work-status consults,
`rca-discipline-lapses-2026-06-01.md`, `responsive-design-audit-2026-05-22.md`,
`work-status-ssot-plan.md`, `rfcs/0001-adr-meta-review.md`.

**Resolution, by disposition:**
- **If kept with status delegated** (keeps describing parked work; its
  open/closed *markers* point at the SSOT): references survive; editorial work
  is internal (the markers).
- **If retired:** the 12 live referencers re-point to the SSOT. Note several
  references are to *specific* deferred entries that are now SSOT items
  (e.g. the two doc-graph-SVG entries → `doc-graph-svg-spline-failure`,
  `doc-graph-svg-render-off-tree`; the stringly-typed-error item; the
  responsive deferrals) — those become "see SSOT item `<id>`".
- **Genre caveat:** `decisions-deferred.md` is a *distinct* genre (decisions
  against action) that is **not** consolidated; its mutual cross-reference with
  deferred-items must be preserved/updated, not collapsed.

## `docs/handoff-current.md` — 28 live referencers — REFRACTOR, don't remove

This is the document the maintainer correctly singled out. Its live referencers
are the project's **entry points**: `README.md`, `FEATURES.md`, `CLAUDE.md`,
`frontend/CLAUDE.md`, `backend/CLAUDE.md`, `frontend/FILES.md`, and all four
`docs/onboarding/*.md` notes — plus a long tail of live notes. Concrete:

- `README.md:28,116` → handoff's **"What this product is"** (pedagogy) and
  **"current operational state"**.
- `FEATURES.md:25,630,661` → handoff's "What this product is" / pedagogy / *"the
  why (pedagogy + system-level …)"*.
- `frontend/FILES.md:17` → *"system-level orientation."*
- `frontend/CLAUDE.md:25`, `backend/CLAUDE.md:25`, `CLAUDE.md:9,43` → an
  **orientation document to read end-to-end**.
- `CLAUDE.md:167,172` → the named home for *internal architecture* and
  *project-level status (release retrospectives, in-flight work)*.
- all four `onboarding/*.md` → the *"living state-of-the-system note"* (a
  mandatory orientation-turn read).

**Content inventory (what is status vs. what is orientation):**
- **Orientation — must survive** (depended on by README/FEATURES/onboarding):
  "What this product is" + the pedagogy vantage points; the umbrella +
  integration model; the per-subproject architecture descriptions; the ADR
  governance summary; rough edges; operational notes; "where to read further."
- **Work-status — delegates to the SSOT:** the per-feature "X is shipped / in
  progress" assertions, the "Where the project is going" roadmap, and the
  "Known gaps" entries that are work items.

**Resolution:** refactor in place — delegate the status slice to the SSOT,
keep the orientation slice. Because handoff is *kept*, **nearly all 28 live
refs survive** and the work is editorial (strip status), not redirection. Two
constraints:
1. README's and FEATURES' **"What this product is" / pedagogy** pointers must
   keep resolving — that section stays in handoff (or moves to a named home
   both re-point to). Do not let it fall into the SSOT, which holds no prose
   pedagogy.
2. The maintainer's note that handoff is "old enough to warrant archival or
   refactoring" is independently true and orthogonal to consolidation: the
   orientation content itself may be stale (e.g. the proxy-pin drift — handoff
   asserts **v1.0.21** while `HEAD` pins **v1.0.27**). The refactor is the
   moment to refresh it. If the file is archived and replaced, the 28 refs must
   re-point to the successor — so prefer in-place refactor to keep them valid.

---

## `CLAUDE.md` — the central edit (flagged separately: harness-loaded)

`CLAUDE.md` references all three docs, and one passage is load-bearing: the
**"Documentation is part of the work" audit** (CLAUDE.md:70–79), which today
enumerates —
- *"Does `docs/TODO.md` need updating to mark items complete…"*,
- *"retiring a … `docs/notes/deferred-items.md` want"*,
- *"Does `docs/handoff-current.md` describe a surface this change affects…"*.

This instruction *is* the retire-on-ship discipline (RCA guard G4). Post-
consolidation it must be rewritten so the **SSOT is the canonical work-status
home**: update `docs/work-status.json` (query via `tools/work-status/sql.mjs`),
TODO.md is its projection, and the handoff check narrows to its *orientation*
content. CLAUDE.md already anticipates this at line 77 (*"the durable fix is a
machine-readable work-status SSOT, of which `TODO.md` becomes a projection"*) —
so the edit completes a turn the file already started. Lines 9/43 (handoff as
an orientation read) and 167/172 (handoff as the home for internal
architecture / project-level status) adjust per handoff's refactor, not its
removal.

Because `CLAUDE.md` is harness-loaded project instruction, this edit is the
most consequential of the set and should be made deliberately, not as a sweep.

---

## Frozen bucket (counted, no action)

Per the do-not-retro-edit-archive rule: `docs/TODO.md` 46, `deferred-items.md`
23, `handoff-current.md` 17 references live under `docs/archive/**` /
`docs/worklog/**` (plus the playbooks/closed-dispatch quasi-frozen tail). These
become dangling on any change and are *expected* drift — the doc-graph report
already segregates them and the project does not fix them.

## Summary — work to resolve, by doc

1. **TODO.md** → keep as SSOT projection (cheapest; preserves 24 live refs);
   edit only the "hand-edit TODO" language, concentrated in CLAUDE.md's audit.
2. **deferred-items.md** → decide keep-with-delegated-status vs retire; if
   retired, re-point 12 live refs (several to now-SSOT items by id); preserve
   the `decisions-deferred.md` genre boundary.
3. **handoff-current.md** → refactor in place (NOT delete): delegate status to
   the SSOT, keep + refresh the orientation/pedagogy content that README,
   FEATURES, the CLAUDE.md tree, FILES.md, and the onboarding notes depend on.
4. **CLAUDE.md** → rewrite the "documentation is part of the work" audit to make
   the SSOT canonical (it already anticipates this); adjust the handoff
   orientation pointers per the refactor. Deliberate edit (harness-loaded).

License: Public Domain (The Unlicense).
