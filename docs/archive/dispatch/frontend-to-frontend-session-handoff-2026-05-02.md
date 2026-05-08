# Frontend → Frontend: End-of-Session Handoff (2026-05-02)

- **Date:** 2026-05-02
- **From:** frontend (outgoing session, Claude Opus 4.7)
- **To:** frontend (incoming session)
- **Type:** handoff
- **Status:** session closing in good condition; thirteen PRs
  merged this session (one coherent arc plus two follow-ons);
  no outstanding action items required of the user.
- **Suggested filing:** `docs/dispatch/frontend-to-frontend-session-handoff-2026-05-02.md`
  per ADR-0005's dispatch ledger convention.

## Closed milestones

This session closed thirteen work units, all on a single
coherent "color theming substrate" arc plus a handful of
typing / bug-fix follow-ons that surfaced during it. Each
landed on its own branch with a PR and a worklog entry under
`docs/worklog/`; the worklog chain is the substantive record
and supersedes this handoff for any specific PR's reasoning.

In chronological order:

| PR | Topic | Worklog |
|---|---|---|
| #80 | A1 — theme.css chrome substrate (16 anchors + 6 chart helpers) | `2026-05-02-theme-substrate-a1.md` |
| #81 | A2 — sweep style.css to var() | `2026-05-02-theme-substrate-a2.md` |
| #82 | A3a — sweep rail/board-list (5 SFCs) | `2026-05-02-theme-substrate-a3a.md` |
| #83 | A3b — sweep charts/viz (6 SFCs + HorizontalTimelineVisualizer block-exception) | `2026-05-02-theme-substrate-a3b.md` |
| #84 | A3c — sweep editors (PaletteEditor, CardSetEditor, RegistryEditor) | `2026-05-02-theme-substrate-a3c.md` |
| #85 | A3d — sweep modals/auth (MintCardModal, ConfirmLoadModal, LoginModal) | `2026-05-02-theme-substrate-a3d.md` |
| #86 | A3e — sweep forest/qeubo/controls (4 SFCs) | `2026-05-02-theme-substrate-a3e.md` |
| #87 | A3f — sweep shell + App.vue (6 SFCs) | `2026-05-02-theme-substrate-a3f.md` |
| #88 | A4 — TS chart adapters via themeColor() helper (closes the SSOT contract) | `2026-05-02-theme-substrate-a4.md` |
| #89 | docs — retire color-theming-substrate Active TODO entry | (commit body) |
| #90 | docs(notes) — file anchor role overloading as a deferred item | (commit body) |
| #91 | frontend — HorizontalTimelineVisualizer rug-plot gradient now uses the LUT (long-standing bug) | `2026-05-02-timeline-gradient-fix.md` |
| #92 | frontend — themeColor signature tightened to `ChromeAnchor` literal union | `2026-05-02-themecolor-typed-anchors.md` |

The user's emotional motivation entering the session was
"the default theme is dark and depressing." After scoping
discussion they explicitly parked theme replacement (B in the
plan's three-phase shape) and committed to **structural close
only**: substrate file, sweep, SSOT contract, no value changes.
The arc above honors that scoping. Any future session that
flips the dark default away from the current values is
operating under separate user authorization.

## Meta-work shipped this session

- **`docs/notes/frontend-theming-plan.md`** is now closed at
  the structural-implementation level. The plan stays in place
  as the design record; sub-PR worklogs are the tactical
  history.
- **`docs/TODO.md`** — Color theming substrate Active Large
  entry retired in place per the established "moved to
  Completed" pattern; closure synopsis added to the Frontend
  Completed table covering the per-PR breakdown, the
  theme-exception inventory, and the parked next steps.
- **`docs/notes/deferred-items.md`** — new entry "Anchor role
  overloading in the chrome substrate," surfaced when the
  user noticed `AnalysisChartPanel`'s `.marker-w` mapping to
  `var(--state-error)`. Names the smell ("substrate role
  coverage gap"), enumerates the worked examples (player-color
  delta charts, review-state borders), proposes the
  **decouple-via-alias** fix shape, and closes with a general
  principle for future SSOT refactors. Stays open until the
  next substrate-tuning pass picks it up.
- **`docs/worklog/`** — thirteen new entries (eleven per-PR
  plus two for the doc-only PRs which are commit-body-only).

## State of the codebase (snapshots worth knowing)

- **`src/assets/css/theme.css`:** 22 chrome anchors at the
  current dark-theme literal values. The substrate's promise
  — one file owns every chrome color decision — is real.
  Every SFC `<style>` block, every chrome literal in TS
  adapters, every CSS rule in `style.css` reads from this
  file (or carries an explicit `theme-exception` comment).
- **`src/utils/theme-color.ts`:** `themeColor(name:
  ChromeAnchor) => string`. Typed against the union of
  declared anchors; throws on missing per ADR-0002. SSOT
  discipline documented in the file header — `theme.css` is
  the source of truth, `ChromeAnchor` is a hand-derived
  mirror, both edit in lockstep.
- **`src/assets/css/style.css`:** swept clean. Dead
  `#debug-resizer`, `#debug-log`, and a body-scrollbar
  experiment removed (confirmed orphaned by repo-wide grep).
- **HorizontalTimelineVisualizer.vue:** rug-plot gradient now
  uses `getIntensityColorLinear` (the perceptually-uniform
  CIELAB LUT) rather than the categorical Tailwind palette
  it had since inception. Visually consistent now with
  MoveSuggestions overlay and BoardTab analysis-meter rugplot
  — the three sites that render analysis depth as color.
- **`docs/notes/frontend-theming-plan.md`:** still on disk;
  the design record stands. The implementation-half retired.

## Substrate-tuning candidates (open follow-ups)

These surfaced during the sweep as patterns that would benefit
from new substrate anchors. Each absorbs one or more
`theme-exception` zones into the role taxonomy. None blocking;
each is a small follow-up PR's worth of work. The
`docs/notes/deferred-items.md` "Anchor role overloading" entry
is the umbrella record; the specific patterns:

- **Muted-state-error surfaces** (`#3a1a1a` resting / `#5a1a1a`
  hover / border) — used in PaletteEditor's `.del-btn`,
  CardSetEditor's `.del-btn`, AnalysisControls's
  `.warning-btn`, QeuboBookmarks's `.delete-btn:hover`, and
  LoginModal's `.btn-danger`. Candidate anchors:
  `--state-error-surface`, `--state-error-surface-hover`,
  `--state-error-text-muted`.
- **Muted-cyan action-button variants** (`#1a3a4a` /
  `#2a5a7a` / `#2a4a5a`) — used in QeuboToolbar's
  `.seg-btn.active`/`.apply-btn`, QeuboBookmarks's
  `.new-btn`, AnalysisTimelinePanel's `.analyze-btn`,
  Toolbar's `.highlight-btn`. Candidate anchors:
  `--accent-primary-muted`, `--accent-primary-muted-border`.
- **Lightened-accent hover** (`#5bc0ff` / `#5dbafa`) — used
  in MintCardModal/ConfirmLoadModal `.btn-submit:hover`,
  LoginModal `.btn-primary:hover`, RootErrorBoundary
  `.reb-reload:hover`. Candidate: `--accent-primary-bright`,
  or rely on `color-mix(in srgb, var(--accent-primary),
  white 15%)` as a CSS-side derivation.
- **Player-color anchors** (B / W in delta charts) — the
  player-color overloading the user named explicitly.
  Candidate: `--player-black: var(--accent-primary)` and
  `--player-white: var(--state-error)` (decouple-via-alias).
- **Review-state anchors** — the `BoardTab.vue` review-active /
  review-intermission / review-complete border classes
  piggybacking on state anchors. Candidate:
  `--review-active: var(--state-attention)` etc.
- **Tailwind semantic indicators in RegistryEditor** —
  `#fbbf24` (Tailwind amber-400) "edited" indicator and
  `#f472b6` (Tailwind pink-400) "symbolic reference"
  indicator. Either extend the substrate with semantic-
  indicator anchors or formalize the registry's color
  vocabulary in `engine/constants.ts` since these are
  band-2 (game-tree-coupled — the registry is the user's
  config tree).

## qEUBO over chrome — the user's parking note

During the planning conversation the user observed that
chrome theming is "the perfect use case for PBO" and noted
qEUBO is already integrated. With 16 anchors × 3 channels =
48 dimensions, downsampling is required, but the qEUBO
integration's `parameter_meta` editor in `PaletteEditor` is
the right scaffolding to feed it. Strategies the user
sketched: working on a subset of colors at once, fixed-
luminance subspaces, anchored hue offsets. Filed as future
work; not actionable until the user prioritizes it.

## Pending — apply queue

Nothing requires user action between sessions.

## Open observations and follow-ons

### `docs/notes/deferred-items.md`

- **Anchor role overloading** — the substrate-tuning umbrella;
  see above and the file itself for the named smell, the
  worked examples, and the decouple-via-alias fix shape.
- All prior entries unchanged from the 2026-04-27 session.

### Active TODO (`docs/TODO.md`)

Frontend Active Medium-tier:
- **Type the pipeline DSL on the frontend** — adopt the
  generated discriminated union in `CardSet.pipeline` to
  retire the largest remaining `any` in domain types.
- **Cards tab merge** — per-board forest + current-card
  overlay (design at `cards-tab-merge-plan.md`). Note the
  schema migration was authored as 11 → 12 but slot 12 is
  taken; needs renumbering at implementation time.
- **Item 18 — `gradingParameter` ACL surfacing (actual
  closure)** — surfaced in the 2026-04-27 auditor entry;
  precondition (proxy v1.0.3+) is now met.

Frontend Active Large-tier:
- **Magic-literals audit** — extends SSOT discipline beyond
  color. Predicate ("color theming substrate done first") is
  now satisfied; user's "structural close only" scoping
  defers further work until they raise it.

### Frontend backlog (`docs/notes/frontend-backlog.md`)

Unchanged from the prior session. The `useUserIORegistry × Monaco`
clash was closed during release wrap-up; other items remain.

### Spec-driven, multi-session

Unchanged. `docs/notes/card-tree-frontend-spec.md` was closed
during the v1 arc.

## Critical meta-lessons retained from session

These surfaced during this session and are worth keeping for
the next:

### Literal-snap-by-cluster as the sweep rule

A2 established the rule: snap each surveyed literal to its
closest plan-recommended anchor by absolute distance, with
ties broken by the plan's survey-cluster assignment. Applied
uniformly across A2 and all six A3 sub-PRs. The within-JND
collapse the plan acknowledged is real but bounded — most
literals shift ±20 grayscale levels. The rule is mechanical,
which is what a 380-literal sweep needs.

The rule has one known affordance-loss case: when resting and
hover states fall in the same cluster (e.g. SidebarWidget's
`.tab-add-btn` had `#444` resting and `#555` hover, both in
plan's `--border-3`), the hover affordance flattens. Recorded
as a substrate-tuning candidate; no per-site fix during the
sweep.

### Pure-black/white rgba is substrate-exempt by class

Surfaced in A3a. ~14 instances of `rgba(0,0,0,X)` /
`rgba(255,255,255,X)` exist across the codebase as shadows,
modal backdrops, and last-move stone outlines. They function
as universal CSS decoration vocabulary, not theme-specific
chrome decisions. Forcing them through `color-mix(in srgb,
var(--surface-0) X%, transparent)` would add verbosity for no
substrate-relevant gain. Documented as a class-level carve-out
in the A3a worklog rather than per-instance theme-exception
noise. Future contributors authoring shadows: pure black/white
rgba is fine; state-color or surface-tone rgba goes through
color-mix from the substrate.

### color-mix for state-color alphas

State-color rgba derivatives (e.g. `rgba(255, 74, 74, 0.4)`
for review-active glow) get rewritten as `color-mix(in srgb,
var(--state-attention) 40%, transparent)`. Bit-identical
visually (color-mix with `transparent` = alpha-modulation),
keeps the SSOT honest at the alpha-derivative layer.
Used consistently in A3a, A3c, A3d, A3e, A3f. Browser support
is Chrome 111+ / Firefox 113+ / Safari 16.4+ — fine for the
project's target.

### "Decouple-via-alias" for role overloading

When a substrate refactor encounters two distinct semantic
roles that happen to share a literal value (e.g.
`--state-error` and "player W"), that's an empirical
observation, not license to merge the roles in the substrate.
The fix shape: add the new role anchor, initially aliasing
the existing one (`--player-white: var(--state-error);`),
sweep consumers to use the new anchor. Visual unchanged at
the time of the change; SSOT contract gains an honest handle;
future tuning can break the aliasing without disturbing the
chrome story. Recorded in the deferred-items entry; principle
extends to typography, spacing, animation, z-index — every
SSOT refactor will face its own version of the role coverage
gap.

### Hand-maintained union over codegen at this scale

PR #92 chose a hand-maintained `ChromeAnchor` literal union
over codegen from `theme.css`. ~22 anchors with low churn
doesn't justify the codegen pipeline overhead; the
hand-maintained union has documented add/rename/remove
playbooks in the file header that absorb the small drift
risk. Decision-deferred trigger: substrate grows past ~50
anchors or churn rate rises. If triggered, follow the
OpenAPI codegen shape (`npm run gen:api` pattern).

### SVG presentation attributes don't evaluate var()

Surfaced in A3a (TreeWidget) and A4 (TS adapters). Inline
`<g stroke="#444" />` in templates can't be rewritten as
`<g stroke="var(--border-3)" />` — SVG presentation
attributes are not CSS properties. Two strategies:
(a) extract the static attrs to CSS classes with `var()`
rules; (b) use `themeColor()` in the script for dynamic
attrs. TreeWidget's A4 sweep uses both — static attrs go
to classes, dynamic `:fill="..."` / `:stroke="..."` go
through script helpers.

CSS rules with `stroke:` and `fill:` properties (inside
`<style>` blocks) DO evaluate `var()` because there they're
CSS properties, not presentation attributes. The distinction
is subtle but important.

### Minimal-touch posture in a 380-literal sweep

ADR-0004's spirit held throughout. Each individual literal
swap was a 1-line edit; a full SFC's `<style>` block was
treated as one unit (Edit with the full `<style>` content
when read in entirety), no full-file rewrites under partial
visibility. Big-diff PRs (A3c, A3f) felt big but were
actually a sequence of localized edits.

### Substrate refactors should pre-emptively name implicit handles

The strongest meta-lesson, articulated explicitly when the
user surfaced the player-color overloading. The substrate's
role taxonomy isn't always rich enough to cover every implicit
role; consumers shoehorn unrelated meanings into existing
anchors when they share literal values. **The fix posture is
not to merge roles in the substrate but to name the implicit
handle and decouple-via-alias.** Apply during all future SSOT
work — typography, spacing, animation, z-index, and the
inevitable second substrate-tuning pass on color.

### The user's collaboration style

- **Branch + PR per work unit.** The pattern from the
  2026-04-27 session held — every sub-PR landed cleanly. No
  exceptions this session.
- **HMR observation as authorization.** The user explicitly
  authorized the merge cadence by stating they could observe
  via HMR. Each PR's visual effect is visible at save time;
  the merge is governance only. Continue the cadence.
- **Structural-close-only scoping.** The session opened with
  the user's "dark and depressing" emotional motivation but
  they explicitly parked theme replacement to focus on the
  structural close. Honor scope decisions sharply — don't
  let emotional motivation drift into scope creep.
- **Honest pushback rewarded.** The "did I see something
  that smells off?" instinct (player-color overloading) was
  rewarded with thoughtful engagement and a deferred-items
  filing. Surface real concerns; don't smooth them over.
- **Tight typing welcomed.** The themeColor signature
  question (PR #92) was a "yeah, why not" — type-strictness
  is appreciated when it surfaces compile-time signals, not
  when it's gratuitous.

## Resumption protocol

To resume cleanly, the incoming session should:

1. Read this dispatch.
2. Read `docs/handoff-current.md` for the umbrella orientation
   if not already cached.
3. Skim the worklog entries from this session — the A1 → A4
   arc is connected and reads well in chronological order.
4. Check `docs/notes/auditor-notes.md` for current auditor
   state. The 2026-05-02 entry (Item 18 / `gradingParameter`
   surfacing) is still the most recent unaddressed observation
   at the start of this session.
5. Check `docs/notes/deferred-items.md` for in-flight
   observations — the new "Anchor role overloading" entry is
   the umbrella for substrate-tuning work.
6. Confirm `npm run build` is green on `main`.

## What's likely next

The user has not signaled a next-priority. Likely candidates,
ordered by surface attractiveness:

1. **Item 18 — `gradingParameter` ACL surfacing.** The
   immediate-action item from the 2026-05-02 auditor entry;
   precondition (proxy v1.0.3+) is now met.
2. **Frontend Active Medium-tier items** — pipeline DSL
   typing, Cards tab merge, the qEUBO frontend-half polish
   if anything remains.
3. **Substrate-tuning pass** — pick a subset of the
   candidates above (player-colors and review-states are the
   obvious starters; muted-state-error has the most sites).
4. **Theme replacement (B)** — flip the dark default to
   something less depressing, either by editing `theme.css`
   directly or by adding `html.theme-X` variants. The
   substrate is in place; this is now a one-file edit.
5. **qEUBO over chrome** — research bet; not actionable
   without the user's prioritization.

The user typically directs explicitly; offer a menu rather
than picking silently.

## Reply

No reply required from the incoming session unless something
in this dispatch reads as inaccurate after first orientation.
If a contradiction surfaces with a worklog or with the actual
code, surface it — wisdom accumulates only if it stays
honest.

Hand off in good condition.
