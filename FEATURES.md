# What this application does

A tour, organised by user-facing surface. Written for people
evaluating the software (Go players, researchers, would-be
contributors); read top-to-bottom for orientation, or jump to
the surface you're curious about.

The project's working purpose: **forward the average capability
of human Go players, as a virtue in itself**. The features below
serve that purpose by composing into a study workflow that
treats positions — not whole games — as the unit of practice,
with KataGo's evaluation as the grader and Ebisu's Bayesian
recall model as the scheduler.

> **Disclaimer.** The application's user-facing surface has
> outgrown what any single person can reliably enumerate from
> memory — neither the project author nor the LLM that helped
> draft this tour is fully cognisant of every capability the
> software ships. This document is best-effort. If you find a
> feature missing, mistagged, or described inaccurately, an
> issue (or PR) is welcome and useful.

For the *pedagogy* behind this — why position-based study with
unrelenting machine evaluation produces durable Go improvement
— see `docs/handoff-current.md`'s "What this product is"
section. For *how* the software is built, see the umbrella
`README.md`, the per-sub-project `CLAUDE.md` files, and the
seven ADRs under `docs/adr/`.

Items in `[brackets]` denote state qualifiers — `[experimental]`
for features that ship but haven't been validated end-to-end;
`[partial]` for features whose backend exists but whose UI is
still being wired; `[planned]` for items the architecture
supports but which haven't been built yet.

---

## The board

A wood-textured SVG Go board with gradient-rendered stones.
Coordinate labels on all four edges, following the
Lizzie / Sabaki / KaTrain / KGS / OGS convention. Board size is
read from the loaded SGF (any size; 9 / 13 / 19 hoshi
patterns supported, others render without hoshi).

- **Stone placement and rule enforcement.** Click an
  intersection to play; the rule engine validates legality
  (suicide / ko / occupied), updates captures, and threads the
  move into the game tree as a new child of the current node.
  Pass moves are representable in the data model and SGF I/O
  but no UI surface for issuing one ships today `[planned]`.

- **Move-number annotation toggle.** A "#" button in the status
  bar overlays each placed stone with its ordinal (1, 2, 3, …),
  scaling font size with digit count so three-digit numbers
  still fit. When the toggle is on, the last-move indicator
  ring is suppressed — the highest number already identifies
  the most-recent move.

- **Last-move indicator.** When move-numbers are off, the
  most-recent placement carries an inner ring; the ring's
  colour contrasts with the stone so it's legible on both B
  and W.

- **Coordinate-label visibility.** Always rendered; sized
  proportionally to the board so the labels stay readable
  across 9-line, 13-line, and 19-line boards.

- **Multiple boards in tabs.** A board rail along the left side
  hosts each open board as a tab — name, close button, an
  inline analysis-meter rugplot showing recent visit pressure,
  and an activity dot ("geiger counter") indicating real-time
  engine work. Hover a tab to preview the board state without
  switching.

- **SGF import and export.** Load via the toolbar's file dialog;
  export the active board to an SGF file via the same surface.
  Game metadata (player names, komi, rules, event, date)
  propagates into the status bar. (Drag-drop import may also
  work depending on your desktop environment's file-manager
  integration, but isn't the documented path.)

## Move analysis (KataGo)

When the engine is connected, the active board is continuously
analysed. The connection is to **KataProxy**, the project's
own KataGo-wrapping proxy (independently developed; included
as a git submodule).

- **Move-suggestion overlay.** Per-move candidates rendered as
  coloured discs on the board, intensity-mapped against the
  visit count of non-best moves. The disc shows the winrate
  inline; the best move carries a score-delta label.

- **Programmable move filter.** A user-editable JavaScript
  expression decides which of KataGo's move candidates render
  as suggestion discs. The expression sees `(move, root, ui)` —
  the per-move `moveInfo` packet, the root info, and a
  ui-context object exposing a numeric threshold slider. The
  default keeps the engine's best move plus any move whose
  visits exceed `ui.threshold` of the root's: a clean "show the
  serious candidates, hide the long tail" predicate. Edit the
  expression to surface only moves above a policy cutoff, only
  cluster representatives, only moves with a positive
  scoreLead delta — anything expressible in a single-line
  JavaScript predicate. This kind of programmable filter is
  conspicuously absent from every other Go GUI we've surveyed,
  and the SR study workflow values it specifically: reviewing
  a position with 30 plausible suggestions on screen is a
  different cognitive task than reviewing the same position
  with 3.

- **Principal-variation preview on hover.** Hovering a move
  suggestion fades the surrounding overlay and animates the
  PV stone sequence on the board in three configurable modes:
  `instant` (all at once), `sequential` (one move per step),
  `window` (sliding window of N consecutive moves). Timings
  user-tunable via the registry editor.

- **Paste PV into the game tree.** **Ctrl+click** (Cmd on Mac)
  or **middle-click** a move suggestion to commit its entire
  principal variation as a new branch in the game tree.
  Existing nodes along the path are descended into rather
  than duplicated, so pasting a PV that partially overlaps an
  existing branch extends cleanly from the divergence point.
  A status-bar hint surfaces the gesture on hover.

- **Ownership overlay.** Three orthogonal sub-modes,
  independently toggle-able:
  - *Continuous fill* — every empty intersection tinted by
    territorial expectation (white-fill for expected-W,
    black-fill for expected-B).
  - *Discrete dots* — same data as small markers.
  - *Stone liveness* — placed stones gain a marker when the
    engine expects the *opposing* colour to own that point
    (i.e., the stone is at risk of capture).

- **Sibling-variation rings.** The current node's siblings (the
  other moves that could be played from the parent position)
  are rendered as stroke-only coloured rings on the board, so
  the user can see alternative branches without leaving the
  current position. Optional label-letter annotations (A / B /
  C / …) when more than one alternative exists.

- **Active-next-move hint.** A small grey ring at the next
  move along the active variation path — visible cue for
  "where this line is going."

- **Engine controls.** Status indicator, connect / disconnect /
  toggle in the toolbar. Auto-reconnect on transient drops;
  capability-negotiation with the proxy (`delta_analysis`,
  `transposition`, `adaptive_reevaluate`, `selector`) gates
  features that depend on proxy version.

- **Multi-model engine selection.** When the proxy is in
  SELECTOR mode (multiple labelled upstream KataGo instances),
  a Toolbar dropdown lets the user pick which model serves the
  active board. The choice flows through to the wire as a
  `model` field on each analysis query.

- **Engine-vs-engine match.** A modal lets the user configure
  black and white engines (independent model + visit budget
  per side), an end condition (N moves), and starts an
  alternating self-play from the current position. The match
  opens its own WebSocket so the singleton analysis service
  stays responsive; STOP MATCH on the toolbar interrupts
  cooperatively.

## Analysis charts

A per-board "Analysis" tab hosts the chart cluster — every
chart reads from the same in-memory ledger of merged KataGo
packets, keyed by `(configHash, nodeId)`.

- **Timeline / rugplot.** Per-move visit pressure rendered as
  a rug along the variation path; densest segments draw the
  eye to where the engine has spent the most cycles. Includes
  selection-range affordance for triggering re-analysis with
  an explicit visit budget over a chosen ply window.

- **Winrate / score-lead / state charts.** Configurable
  per-move metrics — winrate, scoreLead, and any
  palette-defined state function — rendered as line charts
  across the variation path. Clicking a point navigates the
  board to that move; hovering surfaces a board-thumbnail
  preview.

- **Multiresolution-interval triangular heatmap.** A triangular
  heatmap rendered from KataProxy's `triangular` enrichment.
  Each cell encodes the engine's evaluation of a slice of the
  variation at a given resolution; clicking a cell projects to
  the matching ply range and re-evaluates. (Previously labelled
  "Stability Interval Analysis" — renamed in chart code; the
  earlier nomenclature was misrepresenting what the panel
  actually shows.)

- **Custom palette state functions.** Every visible metric is
  defined by a user-editable expression over KataGo's response
  packet (winrate, scoreLead, visit distribution, ownership
  map, policy head, principal variations). Adding a new metric
  is one entry in the palette editor — no source edits.

- **Range-selection re-analysis.** Drag a range on any chart
  and request fresh KataGo evaluation across that range with a
  caller-specified visits target. The chart updates as packets
  arrive.

- **Analysis bundle persistence.** Save the active board's
  analysis ledger as a per-board bundle on the backend; restore
  on next session for the same board. Manual gate — the
  user chooses when to save / discard, no silent uploads. The
  AnalysisControls panel exposes the save/discard surface with
  a reactive subtitle ("Saved 2 minutes ago, 142 nodes").

## Spaced-repetition study — the Cards tab

The Cards tab is the primary study surface. Splits into
**Decks** (curated subsets of cards for focused review) and
**Browse** (file-manager-style navigation of every game-source
in the database).

### Card minting

Turn any position on any board into a **flashcard**. The mint
modal collects:

- **Target moves** — how far past the position the engine
  evaluates when grading the user's response.
- **Default visits** — the visit budget for grading queries.
- **Discount γ** — Ebisu's recall-decay parameter, per card.
- **Analysis palette** — which palette compiles the grading
  signal.
- **Tags** — comma-separated plain tags attached to the card.
  Virtual tags (the `$tactic,~$blocked` macro form) are NOT
  authored at mint time; they live as a query-time
  macro-expansion language layered on the datalog-like tag DSL
  used by deck pipelines. See *Decks* below for how virtual
  tags participate in selection.
- **Lineage** — the card is born either as a *Root* (new
  origin from the SGF) or as a *Branch* (derived from an
  existing card), forming the parent-child *Heredity tracking*
  surface the pedagogy depends on.

### Decks (the pipeline DSL)

A **deck** is a saved pipeline that produces a card list at
review time. Pipelines compose stages: `select` (lineage or
tag-DSL), `take` (limit count), `shuffle`, `order` (BFS, DFS,
recency, …). Composition is JSON-shaped and hand-edited via a
CodeMirror 6 editor with continuous lint. The full grammar —
stages, selections, order keys, structural coordinates — is
documented in `backend/docs/tree-dsl.md`.

- **Tag-DSL virtual tags.** Define `$attack :- $tactic, ~$blocked`
  in the editor and reuse `$attack` as a tag elsewhere. The
  language supports negation in definitions, parenthesised
  grouping, and transitive references; full grammar, semantics,
  and worked examples in `backend/docs/tag-dsl.md` (an interactive
  REPL ships at `backend/scripts/tag_dsl_repl.py`).

- **Context-id macros.** Use `${N}` in the deck's context-ids
  field to expand a game-source id to all of its root card
  ids. Resolved client-side from the loaded forest stats.

- **Hyperparameter harness** `[experimental]`**.** Decks can
  declare *holes* — named handles bound at pipeline-run time.
  A bare identifier in value position (e.g.
  `{ "stage": "take", "n": deck_size }`) marks a hole; the
  CardSet editor lints definitions against usage with a
  per-declaration panel for name / type / default / constraints.
  Clicking "Run pipeline" or "Start Review" opens a small modal
  that collects values (defaults pre-filled, per-field validators
  in place) — same deck produces a family of related sessions
  parameterised by the holes, with no deck duplication. Built-in
  default decks ship with their session-size knob (`deck_size`)
  declared as a demonstration.

- **Start review.** "Start Review Session" runs the pipeline
  and immediately enters review mode. "Run pipeline" runs the
  same query but stays in browse — useful for inspecting what
  a deck would surface without committing to study it.

### Review sessions

In-session, the right panel of the Cards tab transforms into
the review controls:

- **Card N of M counter.** Always visible — progress through
  the session.

- **AWAITING_MOVE state.** The board is set to the card's
  position; the user plays their guess. Move suggestions are
  hidden during this phase so the user isn't influenced by the
  engine.

- **Engine response and grading.** After the user moves,
  KataGo evaluates the position; the palette-compiled grading
  signal produces a recall outcome that Ebisu uses to schedule
  the card's next review.

- **INTERMISSION state.** Between cards, suggestions become
  visible and the intermission chart shows the user's move in
  context (palette-derived metrics). Click anywhere on the
  intermission chart to navigate the board to the position
  before that move.

- **Per-card visit override.** A number input on the in-session
  panel lets the user override the visit budget for the current
  card. Each card carries its own `defaultVisits` set at mint
  time (cards are the things that have visit budgets — decks
  are ephemeral DSL programs that asynchronously resolve to a
  card list, not parameter carriers; the same deck evaluated at
  different times can produce different card sets per the
  time-dependent Ebisu schedule). The override applies to the
  current card only and persists across the session.

- **FINISHED state.** Session-end summary; back to the deck
  picker.

### Browse mode (Forest Directory)

A file-manager-style navigator alongside a card-tree chart.

- **Game-source → roots hierarchy.** The left navigator lists
  game-sources at the top level; expand a game-source to see
  its root cards. Aggregate counts per game-source (total
  cards, total reviews, average recall). The "Game ID" badge
  on each game-source row is the stable identifier the user
  references in the `${N}` context-id macro.

- **Card-tree forest visualisation.** Selecting a game-source
  or root in the navigator renders the matching card tree as
  an ECharts tree-series in the right pane. Per-tree
  accordion: one tree expanded at a time. Hover a card node
  for a board-thumbnail preview. Orientation toggle
  (horizontal / vertical).

- **Active-set overlay.** When a deck-pipeline result is
  loaded, the matching cards in the tree paint blue (active
  set); context cards stay grey. During an active review
  session, the current card paints orange so the user can see
  where they are in the deck's forest.

## SGF library `[partial]`

A relational repository for the user's collection of SGF files.
The backend half ships as part of this arc; the SPA-side
browseable list with sortable headers, filter inputs, and
thumbnail preview pane is queued behind the frontend
consumption arc.

**What it does.** A user with a collection of SGF files
(personal play, professional games, problem sets) imports them
in batches and browses them in a list-with-preview UX
reminiscent of a tab-manager or relational-DB front-end. Each
row carries the SGF's typed metadata — players, date, result,
ruleset, board size — and click-to-preview pulls the full SGF
for thumbnail rendering. Sort by any column header; filter on
player names, date range, result, ruleset, board size.

**Card creation from library entries.** Opening a library game
on a board carries its `client_game_id` through; subsequent
card mints from that board dedup against the existing library
row rather than creating a parallel entry. The library is the
seed bed, not a parallel namespace.

**What's in scope.**

- Backend: schema additions to `game_source` for the typed
  metadata columns (`date`, `result`, `ruleset`, `board_size`)
  plus a `metadata_extra` JSON column for every other SGF
  property; five REST endpoints under `/library`
  (`POST /library/games/import`, `GET /library/games`,
  `GET /library/games/{id}`, `DELETE /library/games/{id}`,
  `GET /library/players` for the filter-input autocomplete) with
  pagination, sort, filter, and per-user dedup.
- Frontend (queued): the list view, the preview pane, the
  filter / sort UX. Virtual scrolling for collections sized
  in the tens of thousands.

**What's deferred.**

- Player-name normalisation (Cho Chikun / 趙治勳 / Cho U
  variants stay as raw strings; query-time normalisation when
  it bites).
- Collection / tag grouping at the library level (different
  from card tags; absent until needed).
- Full-text search on player names or descriptions (simple
  LIKE filters suffice).
- "Unknown"-fallback unification across card-mint and
  library-import flows.

Design rationale: `docs/notes/sgf-library-plan.md`.

## Power-user customisation

The application's working philosophy is "transparent depth" —
every abstraction the system uses is exposed and editable.

- **Palette editor.** The Analysis Environment is a palette of
  named functions over KataGo's response packet. Each function
  is a Python-shaped expression (e.g.
  `_maxvisits(x) / x["rootInfo"]["visits"]`). Built-ins like
  `safe()`, `entropy()`, `player_sign(x)` are available. Add
  your own metrics; reuse them in charts, in card-grading
  pipelines, anywhere the palette is consulted.

- **Registry editor.** A dynamic editor over the entire
  AppSettings tree — engine URL, KataGo override settings,
  palette parameters, PV animation knobs, board overlays,
  chart visibility, every tweakable threshold. Add /
  remove / mutate keys at runtime; changes apply immediately
  and persist on next sync.

- **Knob registry.** A cross-domain sliders surface in the
  Other tab, listing every preference-flavoured scalar in
  the system grouped by domain (Display, Engine, Palette, …).
  Drag a slider; the underlying value updates in real time
  on every consumer surface that reads it (board overlays,
  watchdog animation pacing, intensity gradient). When qEUBO
  is running an experiment, the parameters it controls show
  as locked with a tooltip naming the consumer; the same
  enforcement applies when other consumers (autonomous-SR
  scenarios, etc.) take a claim. Sliders for analysis-env
  palette parameters appear automatically when their range
  is configured in PaletteEditor. A toolbar quick-access
  popover ("SLIDERS" badge) gives a priority-ordered hover
  list of the same sliders in compact form for rapid
  adjustment without switching tabs; the Other-tab editor
  remains the spacious grouped view.

- **Card-set editor.** Tree-DSL pipelines edited in CodeMirror
  6 with JSON5-superset dialect (trailing commas, single
  quotes admitted). The hyperparameter-declarations panel lives
  alongside the pipeline editor and lints definitions against
  usage.

- **Keyboard registry.** All keyboard shortcuts route through
  a single hardware-event-to-domain-verb registry. Editable
  bindings, with form-control / contenteditable guards so
  shortcuts don't fire while typing.

## qEUBO palette calibration `[experimental]`

Bayesian preference-based optimisation over palette parameters.
The user presents themselves with two candidate palette
configurations (A vs B) during review, expresses a preference,
and qEUBO updates a posterior over the parameter space — over
many comparisons, converges to a palette that surfaces reviews
the user finds most valuable.

- **Audition toggle.** Try A or B non-destructively — overrides
  what the engine sees during this session without persisting.
- **Verdict pair.** "I prefer A" / "I prefer B" — submits the
  qEUBO observation without changing the active palette.
- **Apply.** Promote the currently-effective audition into the
  active palette parameters.
- **Pin.** Save and name the parameter set qEUBO is currently
  presenting — promotes the live A-or-B candidate into a
  durable named entry so the user can return to it after
  further optimisation rounds.
- **Bookmarks.** The list of pinned parameter sets, independent
  of the experiment lifecycle (bookmarks survive experiment
  deletions, restarts, etc.).

Status: feature-complete in code; end-to-end UI validation with
Redis still pending. `QEUBO_ENABLED=False` by default on the
backend; flip the env-var to opt in.

## Workspace and chrome

- **Resizable layout.** Sidebar, board area, control panel —
  the boundary between board column and control panel is
  user-draggable; the drag mutates a registry setting that
  caps the board square's max width. Tree panel within the
  Cards tab is also resizable.

- **Tabs.** The control panel hosts four named tabs: Cards
  (the primary surface above), Settings (managed registry +
  palette + deck editors + analysis environment), Analysis
  (the chart cluster), Other (gradient calibration, qEUBO
  bookmarks).

- **Internationalisation.** Vue-i18n with bundled catalogs.
  English source is fully populated. Simplified Chinese,
  Japanese, and Korean ship as LLM-drafted catalogs with a
  machine-translation notice — native-speaker review is the
  remaining gate per locale. Locale picker in the toolbar;
  selection persists across sessions.

- **System log.** Always-visible bar at the bottom showing
  errors, warnings, and info messages. Collapsible; when
  collapsed, error / warning arrivals briefly auto-reveal the
  panel so the user notices.

- **Theme substrate.** All chrome colours and typography route
  through CSS variables. A "Gradient Calibration" surface in
  the Other tab lets the user tune the colour gradient driving
  move-suggestion intensity.

## Authentication and persistence

- **Zero-friction local-install mode.** A fresh install runs
  transparently passwordless — open the app and the workspace
  is yours. Switch into multi-user mode by flipping the
  backend's `ALLOW_PASSWORDLESS_LOGIN` flag.

- **Optional username + password.** Register, sign in, sign
  out, switch user. The login modal handles all four flows.
  JWT-based, with auto-401 retry plumbing so a session
  expiring mid-use doesn't lose the user's place.

- **Identity-aware workspace sync.** The entire SPA state
  (open boards, expansion state, palette overrides, analysis
  ranges, settings) is debounced-uploaded to the backend as a
  single per-user document. On sign-in, the document hydrates
  back into the SPA. Schema migrations bring older blobs
  forward through `frontend/src/store/migrations.ts`.

- **Force-persistence button.** In Settings — bypasses the
  debounce and writes immediately. Useful for debugging or
  before a known disconnect.

## What's intentionally absent

- **No multiplayer.** The engine is the only opponent.
- **No game database / playback library.** Storage is
  incidental to the SR workflow; loading SGFs is one-shot.

These are deliberate scope decisions, recorded in
`docs/handoff-current.md`'s "What this product is" section.

A **human-vs-engine play mode** is *not* on the
intentionally-absent list — it simply hasn't been built yet. The
engine-vs-engine match is the closest surface that ships today;
a casual play affordance is a plausible direction `[planned]`,
not a scope-line decision against the idea.

---

## Maintaining this tour

When you add a new user-facing feature, add an entry here in
the same PR — under the surface it lives on, with one to three
descriptive sentences. The full discipline is recorded in the
umbrella `CLAUDE.md`'s "User-facing tour" section.

**Immature-feature allowance.** A feature that ships but
hasn't been validated end-to-end should be tagged
`[experimental]`; one whose backend exists but UI is partial,
`[partial]`; one the architecture supports but which isn't
built, `[planned]`. Refining the entry as the feature firms
up is expected; pretending a feature is settled when it isn't
is the failure mode the tags exist to prevent.

If a feature is **removed**, remove the entry. If it changes
materially, update the description in the same PR.

## Companion docs

- `README.md` (umbrella) — clone, build, run.
- `docs/handoff-current.md` — the *why* (pedagogy + system-level
  orientation).
- `frontend/FILES.md` — per-file navigation map for the SPA.
- `frontend/README.md` — frontend-specific build / lifecycle.
- `frontend/CLAUDE.md` — frontend authoring discipline.
- `docs/adr/` — architectural decision records.
