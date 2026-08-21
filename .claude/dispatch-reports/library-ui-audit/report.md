# LengYue Library interface — UI audit

**Commission (verbatim):** "More generally, the library interface is incredibly ugly. Have an
Opus agent criticize it explicitly; use local_user since it's got GoGoD loaded."

**Auditor:** Opus subagent, adversarial UI critic posture. Criticism only — no remedies, no
roadmap. Remedies are decided elsewhere.

**Substrate.** Frontend served from this worktree (`bork/audit/library-ui`, base
`66b5350e`) on `localhost:19180` via `vite 8.2.0`; the SPA talks directly to the live
backend on `:8764` (no proxy — `src/config/env.ts` resolves `API_BASE_URL` to
`http://localhost:8764`). Authenticated as `local_user` by the app's own auto-login
(`auth_username=local_user` in `localStorage`). Library holds **28,847 games / 2,092
distinct players** (GoGoD professional collection plus a handful of the operator's own
online games). Playwright chromium 1228, headless, single instance, 1920x1080, under
`systemd-run --user --scope -p MemoryMax=4G` + `nice -n 19` +
`--js-flags=--max-old-space-size=1024`. **Read-only throughout**: no import, no delete, no
save, no settings write. The one modal reached (`BOARD IN USE`) was dismissed via
**Cancel**, never "Overwrite Current". The dark-theme comparison was taken by setting
`document.documentElement[data-theme]` in-page — a client-side attribute flip, never the
settings UI, so nothing was persisted.

**Default theme as the operator actually runs it** is `data-theme="cluster"`, labelled
"Light" in Settings — a pink/magenta palette. Findings are reported against that default;
where the dark theme differs materially it is called out.

**Every finding below is WITNESSED** — each carries the screenshot that shows it and, where
the defect is a measurement rather than an appearance, the computed value read out of the
live DOM.

---

## L1 — Eight design tokens the Library is written against do not exist. ~58 style declarations are silently discarded.

**Witness:** `assets/L-10-wide-default.png`, `assets/L-02-rail-crop-default.png`; computed
styles read from the live DOM.

The five Library components style themselves with `--space-tiny`, `--space-small`,
`--space-large`, `--text-small`, `--text-default`, `--text-muted`, `--border-subtle` and
`--z-dropdown`. **Not one of these is defined anywhere in the codebase.** The theme's actual
vocabulary is `--space-tight/default/medium/loose`, `--text-tiny/body/emphasis/heading`,
`--border-1/2/3`, `--text-0/1/2`. A `var()` that resolves to nothing makes the whole
declaration invalid, and CSS drops invalid declarations in silence — so every one of the
~58 affected declarations across `LibraryTable.vue` (11), `LibraryPreviewPane.vue` (16),
`LibraryTab.vue` (13), `LibraryImportPanel.vue` (10) and `LibraryPlayerFilter.vue` (8)
evaporates at paint time. Measured consequences, live: `.library-row` padding `0px`;
`.library-split-list` border `0px none` (its stylesheet says `1px solid`); `.th`,
`.filter-label`, `.import-hint`, `.meta-vs`, `.meta-details` all `font-size: 10px` and all
`color: rgb(11, 0, 27)` — i.e. every "small" size and every "muted" tone silently falls
back to full-emphasis body text; `.filter-suggest` `z-index: auto`. This is not a styling
preference gone wrong, it is a **stylesheet that never ran**, and it is the upstream cause
of roughly half of everything below. That it shipped is the real indictment: nobody looked
at this screen after writing it, and no lint rule guards the token vocabulary. Genre has
nothing to compare against here — OGS, Sabaki and every GoGoD front-end render the CSS
their authors wrote. The comparison is not "other Go apps do it differently", it is "other
software applies its stylesheet."

---

## L2 — The two most important columns in a Go game library render at **zero pixels wide**. 28,847 games, not one player name visible.

**Witness:** `assets/L-02-rail-crop-default.png` (the shipped default), against
`assets/L-11-wide-selected.png` (after manually dragging the panel wider).

In the layout the app actually starts in, the Library occupies a 195px content column. The
row grid is `40px 1fr 1fr 110px 80px` — 230px of *fixed* track in a 195px box before the
two `1fr` player columns get anything at all. Measured on the live row: `col-ordinal` 40px,
**`col-player` 0px (scrollWidth 70)**, **`col-player` 0px (scrollWidth 58)**, `col-date`
110px, `col-result` 80px. The data is there — "Cho Hun-hyeon", "Seo Pong-su" — and it is
painted into a box of zero width. A Go game is identified by **who played it**; that is the
primary key a studying player scans by, and it is the reason a GoGoD collection exists at
all. What the user sees instead is a column of database ordinals, a column of dates, and a
column of results: `28847 . 1981-09-08 . B+1.5`. Twenty-eight thousand games, rendered as
anonymous. The header suffers the same collapse and prints as the literal string
**"BlackWhiteDate"** — three column labels fused into one word because `gap:
var(--space-tiny)` was dropped by L1 — while the "Result" label is pushed off the panel
edge entirely, so the one column that *does* show values has no heading above it. Every
comparable surface — OGS's game archive, Sabaki's file list, GoBase, the GoGoD front-ends —
leads with the two player names and treats everything else as secondary; several drop the
date before they would drop a name. Note also there is no minimum width, no horizontal
scroll, and no column-priority rule, so the failure is silent: the layout does not
complain, it just stops showing you the games.

---

## L3 — The library of a study application is a 219px splinter beside a 1,400px board.

**Witness:** `assets/L-01-library-default.png` (full viewport, 1920x1080).

Measured: `.library-tab` is **219px wide** — 11% of the viewport — pinned in the right rail
next to a 1,020px board and a game-tree gutter. Inside it a master-detail layout is
attempted: a list, and a detail pane that measured **35px tall** before a selection was made
(`.library-split-preview` h:35), reduced to the single line "Select a game from the list to
preview." A master-detail split inside 195px is not a layout, it is a wish. The panel *can*
be dragged wider — there is an `#resizer-outer` — but nothing in the surface says so, the
Library does not claim more width when you switch to it, and the default it opens in is the
one shown. This is a category error about what the Library *is*: browsing 28,847 professional
games is a **primary task with its own screen**, not an inspector panel accessory to the
board. OGS gives the game archive a full page. Sabaki opens a file browser over the board.
Every GoGoD tool ever written is a database browser first. Here the surface where you *find*
what to study is subordinated to the surface where you study it, permanently, by geometry.

---

## L4 — The list cannot be operated by keyboard at all. No arrows, no Enter, no focus, no roles.

**Witness:** `assets/L-30-header-focus.png`; tab-order walk and key-press probes against the
live DOM.

Measured on the live page: `.library-row` has `tabIndex -1`, no `role`, and is a bare
`DIV`; the table has no `role`; `aria-sort` is `null` on all five headers; the number of
focusable elements inside the scroll region is **0**. A clean tab walk from the first filter
input goes: filter -> filter -> "All players" disclosure -> Black -> White -> Date -> Result ->
the scroll container -> **and then out of the Library entirely**, into the board toolbar.
With a row selected by mouse, `ArrowDown` does not move the selection
(`arrowKeysMoveSelection: false`) and `Enter` does not open anything (`enterOpens: false`).
So: you cannot reach a game, select a game, preview a game, or open a game from the
keyboard — in a 28,847-row list whose entire purpose is repeated scan-and-pick. This is the
single most universal convention in the genre and outside it: OGS's archive, Sabaki's file
handling, every OS file manager, every mail client, every IDE file list moves selection with
Up/Down and commits with Enter. There is no novelty argument available here, because nothing
novel was attempted — the interaction was simply not built. The screen reader story is the
same omission seen from the other side: a grid of nested `div`s with no roles and no
`aria-sort` announces nothing.

---

## L5 — In the default theme, three separate surface-differentiation mechanisms all no-op simultaneously. Hovering a row does literally nothing.

**Witness:** `assets/L-42-hover-noop.png`, `assets/L-11-wide-selected.png`; computed
backgrounds; `src/assets/css/theme.css:198-201`.

The `cluster` theme defines `--surface-0`, `--surface-2` and `--surface-3` as **the same
value** (`var(--cluster-12-9)`), with an in-file comment cheerfully explaining that raised
surfaces go "back to bg tone". The Library leans on exactly that distinction in three
places, and all three collapse: `.library-row:hover { background: var(--surface-2) }` over
`.library-table { background: var(--surface-0) }` — measured hover background
`rgb(254,218,247)`, identical to the table beneath it, so **there is no hover feedback
whatsoever on a clickable row**; `.library-table-header { background: var(--surface-2) }` —
the header strip is the same tone as the rows, so it does not read as a header; and
`.library-preview { background: var(--surface-2) }` — measured identical to the list's
background, so the detail pane has no boundary against the master. Combine that with L1
having deleted every `border: 1px solid var(--border-subtle)` on `.library-split-list` and
`.library-split-preview`, and the result is one undivided field of pink in which a list, a
header, and a preview pane happen to be printed. A hover state is the cheapest and most
basic feedback a pointer UI offers; a list of 28,847 clickable rows that gives none of it
leaves the user unable to confirm which row is under the cursor before committing a click.

---

## L6 — No row separators, no zebra striping, and a 32px row pitch wrapped around 10px text. Simultaneously too sparse to be dense and too small to read.

**Witness:** `assets/L-11-wide-selected.png`, `assets/L-24-dark-theme.png`.

`.library-row` declares `border-bottom: 1px solid var(--border-subtle)`; measured
`border-bottom: 0px none` (L1). There is no zebra striping, no column rules, no group
banding. So a 28-row screen of dense tabular data — five columns of names, dates and
results — is rendered as free-floating text on a flat field, with nothing to guide the eye
horizontally across a 682px row from "Kato Masao" to "W+4.5". Meanwhile the vertical rhythm
is actively hostile: the row is a hardcoded 32px tall around 10px type, so roughly
two-thirds of every row is empty background. Both errors point the same way and cancel
nothing: the type is too small to read comfortably *and* the rows are too tall to scan
efficiently, which is how a 1080px screen ends up displaying **28 of 28,847 games**. The
genre's answer is settled and boring: OGS, GoBase and the GoGoD front-ends all use hairline
rules or alternating row tints with a row height sized to the type. Nothing here is a
deliberate departure — it is a `magic-literal` comment in `LibraryTable.vue` admitting the
32px was "calibrated by eye" against unrelated surfaces, plus a separator that never
rendered.

---

## L7 — Double-click selects the row's text (the flagged item), and does not open the game — it opens a modal asking what "open" means.

**Witness:** `assets/L-13-dblclick-textsel.png` (the text selection),
`assets/L-14-dblclick-modal-wide.png` and `assets/L-05-dblclick-fullpage.png` (the modal).

Confirmed and worse than reported. `.library-row` sets `cursor: pointer` and binds
`@dblclick`, but never sets `user-select: none`, so the browser's native word-select fires
on the same gesture. Measured after a double-click:
`window.getSelection().toString() === "Koichi"`, `isCollapsed: false`. The screenshot shows
the consequence precisely: on an already-selected row, the surname "Koichi" sits inside a
**magenta browser-selection rectangle on top of the blue row highlight**, next to near-black
text — three colours fighting inside one 32px row, and a *half-selected* cell at that, since
double-click grabs one word rather than the name. It reads exactly as cheap as the
maintainer says. The contextualisation, though, is that the text smear is the smaller half
of the problem: the gesture **does not open the game**. It raises a full-viewport scrimmed
modal titled `BOARD IN USE` — "The current board has moves. How would you like to load this
position?" — with Cancel / Overwrite Current / Open in New Tab and an unstyled default
checkbox. On a study library, opening games is the loop; interrupting every single
iteration of that loop with a three-way modal is the interaction-design equivalent of a
confirmation dialog on every keystroke. Sabaki opens the file. OGS navigates to the game.
Neither stops to ask, because neither destroys state to do it.

---

## L8 — The game preview previews nothing: it always renders the empty board at move 0.

**Witness:** `assets/L-11-wide-selected.png`, `assets/L-16-autocomplete.png`,
`assets/L-22-preview-move0.png`, `assets/L-31-narrow.png`; contrast
`assets/L-23-preview-scrubbed.png` after manually dragging the scrubber.

`scrubPosition` initialises to 0, so selecting any game renders a 360x360 slab of blank
wood grain. The screenshots show it repeatedly: `Ma Xiaochun vs Nie Weiping`, `0 / 165`,
empty board. `Kobayashi Koichi vs Kato Masao`, `0 / 131`, empty board. The one job of a
preview pane in a game library is to answer "what does this game look like" without opening
it, and this one answers it with a picture that is identical for all 28,847 rows. Worse, the
board's own grid lines render as near-invisible hairlines against the wood at this size —
compare the strong lines on the main board in `assets/L-01-library-default.png` — so the
default state is not even legible *as a goban*; it is a rectangle of texture. The pane will
happily show the game once you find and drag the unlabelled range input beneath it
(measured 153 SVG nodes after scrubbing to the midpoint), which makes this a default-value
choice rather than a missing feature — and the wrong default by a wide margin. Genre: OGS
thumbnails the final position, Sabaki shows the position at the loaded node, GoBase's
diagrams show a position with stones on it. Nobody previews a game with an empty board.

---

## L9 — The preview names White first, contradicting Go's universal convention *and* the table's own column order — and jams "vs" against both names.

**Witness:** `assets/L-43-preview-meta.png` (close crop), `assets/L-11-wide-selected.png`,
`assets/L-24-dark-theme.png`.

The crop reads, in full: **`Kobayashi KoichivsRin Kaiho`**. Two defects in eleven
characters. First, the gap: `.meta-players` sets `gap: var(--space-small)`, dropped by L1,
so the "vs" separator collides with both names and the whole thing renders as a single
run-on word — and because `--text-muted` is also undefined, "vs" is painted in the same
colour and near the same weight as the names, so it does not even read as a separator.
Second, the order: the table for that row lists Black = Rin Kaiho, White = Kobayashi
Koichi. The preview lists **Kobayashi Koichi first**. Every SGF header, every game record,
every Go publication and every tool in the genre names Black first — it is as fixed as
"White to move" notation in chess, because who held Black determines how the whole game is
read. So the detail pane both violates the convention and contradicts the master list
standing six inches to its left, and since neither name is labelled or coloured by colour,
there is no way to recover which is which from the preview alone. The metadata line
underneath (`1981-11-12 . B+R . 19x19`) is separated by middots at the same 10px in the same
colour as everything else, so date, result and board size read as one undifferentiated
string.

---

## L10 — The primary call to action is an 11-pixel-tall button whose label sits at 1.84:1 contrast.

**Witness:** `assets/L-44-open-button.png`, `assets/L-31-narrow.png`,
`assets/L-11-wide-selected.png`.

"Open in board" is the action the entire surface exists to deliver. Measured bounding box:
**63.4 x 11 px**. Its padding (`var(--space-tiny) var(--space-small)`) was dropped by L1, so
the button is exactly its 10px line box plus one pixel, in a 455px-wide pane with several
hundred pixels of unused space beneath it. Eleven pixels is under half of any pointer-target
guidance and roughly a quarter of touch guidance. Then the colour: `.preview-btn.primary`
sets `color: var(--surface-1)` — a **surface** token used as a foreground — which in the
default theme resolves to taupe `rgb(122,111,109)` on the accent `rgb(0,167,255)`.
Computed contrast ratio: **1.84:1**, against a 4.5:1 floor. The screenshots show the result:
a smear of blue with something written on it. And in the shipped 219px layout this button
falls below the fold of a 275px pane, so the primary action of the Library is an
illegible 11px chip that you must scroll a splinter of a panel to reach. Genre convention
for a primary button is not subtle and has not moved in twenty years: adequate padding,
a legible label, and placement where the eye lands.

---

## L11 — Selected-row text in the dark theme sits at 2.44:1 — and the source comment claims this exact problem was solved.

**Witness:** `assets/L-24-dark-theme.png`; computed colours.

`.library-row.selected { background: var(--accent-primary); }` and nothing else. In dark,
that is `#4aaef0` under inherited `#ffffff` body text: computed contrast **2.44:1**, well
under the 4.5:1 floor, and plainly hard to read in the screenshot — row 28846's white text
dissolves into the light blue behind it. What makes this worse than an oversight is the
comment sitting directly above the rule, which states that forcing a foreground "produced a
low-contrast grey-on-blue that was hard to read" and that inheriting the body colour "keeps
readability constant between selected and unselected rows." It does not. Inheriting swaps
one contrast failure for another and moves it into a different theme, and the comment
records the reasoning as settled so the next reader will not re-check it. Meanwhile in the
default theme the same rule lands at 7.74:1 near-black-on-cyan, which passes but looks
foreign — a saturated electric `#00A7FF` bar dropped into a pastel pink surface it shares
no hue relationship with. A selection highlight that is illegible in one theme and
out-of-palette in the other is not a highlight, it is two separate bugs wearing one rule.

---

## L12 — 10px type across the entire surface with no hierarchy of any kind: headings, labels, hints, metadata and body all identical.

**Witness:** `assets/L-11-wide-selected.png`, `assets/L-02-rail-crop-default.png`.

Measured, in *both* themes: `.th`, `.library-row`, `.filter-label`, `.import-hint`,
`.meta-vs`, `.meta-details` all report `font-size: 10px`, and all report the same colour —
`rgb(11,0,27)` in the default theme, `rgb(255,255,255)` in dark. Not similar. **Identical.**
The design clearly intended three tiers (`--text-small` for labels and metadata,
`--text-muted` for de-emphasis, body for content) and L1 flattened all of it into one. The
result is a screen on which a column heading, a form label, a placeholder hint, a game
result, a player's name and a separator glyph all carry precisely the same visual weight,
so nothing recedes and nothing leads and the eye has no entry point. On top of that, the
absolute size is 10px — the app's global body default — which for a dense scanning table
read at arm's length is at the bottom edge of comfortable, and there is no user control
over it on this surface. Typographic hierarchy is the cheapest structure a text-heavy UI
can have; this one has none.

---

## L13 — Every keystroke in a filter blanks the entire list to a field of 28 ellipses.

**Witness:** `assets/L-20-deepscroll-loading.png`, `assets/L-16-autocomplete.png`.

Typing into a player filter, or scrolling into an unfetched range, replaces the list with
rows whose only content is a single ellipsis glyph flush against the left edge — and since L6
removed every row border and L5 removed every background differentiation, those glyphs float
in an unbroken pink void with no row shapes, no column positions, and no indication that a
table is there at all. `assets/L-16-autocomplete.png` shows the same thing during filtering,
with an orphaned "Loading..." string parked at an arbitrary horizontal offset because
`.library-empty`'s `padding: var(--space-large)` was dropped. The honest description of
this screen is "the application appears to have crashed." The genre answer is skeleton rows
that preserve the row-and-column geometry so the layout does not flash, which is what OGS,
GitHub, and essentially every list-backed web UI shipped since roughly 2016 do; failing
that, keeping the previous results on screen dimmed. What must not happen is what happens
here — the content disappearing entirely on each keystroke.

---

## L14 — Below 700px the layout inverts its own priorities: the list becomes a six-row peephole so an empty board can have two-thirds of the panel.

**Witness:** `assets/L-31-narrow.png`; measured geometry at a 1100px viewport.

The container query at `max-width: 700px` stacks master over detail with
`grid-template-rows: minmax(0, 1fr) minmax(0, auto)`. The `auto` track lets the preview claim
its full content height first, and the list gets the remainder. Measured at a 1100px
viewport: list **459 x 215px**, preview **459 x 464px**. Six visible rows of a 28,847-game
library, beneath which sits a 360px picture of an empty goban (L8) taking more than twice
the space. The responsive rule is not merely imperfect, it is inverted — as the surface gets
more cramped it spends its scarcest resource on the least informative element, and the one
thing the user came for is the thing squeezed. This is also the state the 219px default
layout is permanently in (L3), where the same rule produced a 35px preview stub, so the
container query is authored for a width the Library never actually has.

---

## L15 — A permanently-mounted, invisible drop zone sits above the list, and its two buttons are indistinguishable from prose.

**Witness:** `assets/L-40-import-zone.png` (close crop), `assets/L-02-rail-crop-default.png`.

The crop shows the whole thing: `Drag an SGF file or a folder of SGFs here, or:` on one
line, `Pick files...Pick directory...` on the next. The panel's `border: 2px dashed
var(--border-subtle)` was dropped by L1, so the drop target has **no boundary at all** — the
one affordance a drop zone consists of is the dashed rectangle telling you where "here" is,
and there isn't one. The two `<button>` elements lost their padding and their
`var(--border-subtle)` border the same way, and `gap: var(--space-small)` went with them, so
they render as unstyled blue-ish text abutting each other into the single string
`Pick files...Pick directory...` — no gap, no box, no visible hit area, no way to tell they are
two controls rather than a sentence. Separately from the rendering: this is a *permanent
banner above the list*, consuming the top of a 219px panel forever, for an action performed
approximately once per collection, while the browsing task it displaces is performed
continuously. Genre puts import behind a toolbar button or a File menu and lets the whole
window accept the drop — Sabaki, OGS's SGF upload, and every desktop app with an Open
command.

---

## L16 — Raw, unnormalised archive data leaks straight through the columns.

**Witness:** `assets/L-11-wide-selected.png`, `assets/L-21-deepscroll-settled.png`,
`assets/L-02-rail-crop-default.png`.

The Date column, 110px and fixed, contains: `1981-09-08` (fine), `1981-09-09,10` and
`1981-05-26,27` (multi-day games, uncanonicalised), `1981-05` (month precision, unmarked),
`Broadcast 1981-03-01...` (not a date at all — a GoGoD free-text field truncated mid-phrase),
and an em-dash for whole eras of the collection once you scroll into the historical Chinese
games. The Result column, 80px, contains `B+1.5`, `W+R`, `W+T`, `W+Forfeit`, `B+Time`,
`B+1.5 (moves ...` truncated mid-parenthetical, `B+19.5 {zi}` with the SGF brace-comment
fragment still attached, and a bare `?`. None of it is parsed, normalised, aligned or
formatted; the columns are string dumps with `text-overflow: ellipsis` bolted on, and none
of the numeric columns carry `font-variant-numeric: tabular-nums` (the ordinals, dates and
results are all set in proportional figures, so nothing lines up vertically), while the `#`
ordinals are left-aligned numbers, which numerals never should be. A GoGoD-oriented tool's
whole value proposition is making a messy archive *legible*; presenting the archive's raw
inconsistencies verbatim is declining to do the job.

---

## L17 — 24,708 rows behind a 790,656-pixel scrollbar with a ~1px thumb, and no other way to navigate.

**Witness:** `assets/L-21-deepscroll-settled.png`; measured scroll metrics.

Measured on the live scroller: `scrollHeight: 790,656`, `clientHeight: 875`. That is a
scrollbar thumb roughly one pixel tall, in which a single pixel of travel moves you about
900 rows. There is no pagination, no jump-to-index, no alphabetical rail, no date grouping,
no year headers, no "go to row", and no sticky context of any kind telling you where in the
collection you currently are — you can sort by date and scroll, but nothing on screen ever
says "you are now in 1962". The only way to reach a specific region of a 28,847-game
collection is to filter by player name, which presupposes you already know who you are
looking for. Genre handles this in ways that are decades old and entirely unglamorous: OGS
paginates, GoBase indexes by player and event, and desktop database browsers offer
type-ahead jump and grouped headers. Virtualising the DOM (which this does, correctly)
solves the rendering cost; it does nothing about the navigation problem, and here nothing
else was attempted.

---

## L18 — The leftmost, first-read column is a database display ordinal.

**Witness:** `assets/L-11-wide-selected.png`, `assets/L-02-rail-crop-default.png`.

The `#` column is fixed at 40px, occupies the primary scan position, is the only column
that survived the width collapse of L2 intact, and carries `28847, 28846, 28845...` — an
internal `display_ordinal` with no meaning to a person studying Go. It is not sortable
(the header is a plain `span` among four buttons, so it silently behaves differently from
its neighbours), it does not correspond to anything the user chose or can act on, and its
own source comment reveals it was added for user-id-enumeration reasons rather than for a
reader. In the shipped 219px layout this produces the surface's defining absurdity: the
column that means nothing is fully visible, and the two columns that mean everything are
zero pixels wide. No game-library convention leads with a row id — OGS, Sabaki and GoBase
all lead with the players or the date, and expose internal ids nowhere.

---

## L19 — The player autocomplete is unranked substring matching, with no counts, no keyboard, and no stacking context.

**Witness:** `assets/L-16-autocomplete.png`.

Typing `Cho` returns, in this order: `Cho Chikun, Cho Hun-hyeon, Cho Nam-ch'eol, Cho Sonjin,
Cho Han-seung, An Cho-yeong, Cho U, Cho Hye-yeon, Han Chong-chin, Nozawa Chikucho,
Cho Tae-hyeon, Hong Chong-hyeon` — prefix matches interleaved with mid-word and suffix
matches (`An Cho-yeong`, `Nozawa Chikucho`, `Hong Chong-hyeon`) with no grouping and no
apparent ranking, so the twelve-item window is diluted by names the user was not typing. No
game counts are shown, even though the composable plainly has them (the "All players" list
renders `count` alongside every name) — so nothing tells you that `Cho Chikun` has thousands
of games and `Cho Tae-hyeon` a handful, which is exactly the disambiguation the user needs.
The list is a `<ul>` of `<li>` with `@mousedown` handlers: **not focusable, no
`ArrowDown`/`Enter`, no `aria-activedescendant`, no combobox roles** — mouse only, like L4.
The items have zero padding (L1), so twelve names are crammed at an 11px pitch. And
`z-index: var(--z-dropdown)` is undefined, leaving the panel at computed `z-index: auto`;
the screenshot shows it painting over the table header, but its stacking position is
accidental rather than declared, so it is one sibling-order change away from being occluded.
In the default theme it also inherits `--surface-2`, identical to the page behind it (L5),
so the "dropdown" is distinguished from the page by a hairline border and a shadow alone.

---

## L20 — Two columns are dropped from the grid and re-served through a native `title` tooltip with hand-spaced ASCII alignment.

**Witness:** measured `title` attribute; `assets/L-11-wide-selected.png`.

Every row carries a native browser tooltip whose value is, literally:
`"Black:  Rin Kaiho\nWhite:  Kobayashi Koichi\nDate:   1981-11-12\nResult: B+R\nRules:  -\nSize:   19"`
— six labelled lines aligned with **padding spaces**, in the browser's OS tooltip chrome.
This is the designated home for Ruleset and Board Size, which exist on every list item and
appear in no column. So two real attributes of a Go game are reachable only by hovering and
waiting out the OS tooltip delay, one row at a time, un-scannable, un-sortable,
un-filterable, and un-copyable, presented in a monospace-assuming layout inside a tooltip
that is not rendered in a monospace font. A native `title` is a last-resort accessibility
crutch, not an information-architecture tier; using it as the overflow bucket for columns
you chose not to show means the user cannot compare rulesets across two games without
hovering each in turn. It is also the surface's only hover feedback (L5), which is its own
small joke.

---

## L21 — The first click on a text column sorts Z->A, and unsorted columns advertise nothing.

**Witness:** `assets/L-15-sorted-by-black.png`, `assets/L-45-header.png`; observed row order.

`onHeaderClick` changes the sort column but leaves the direction alone, so switching from
the default (date, descending) to "Black" inherits `desc` and lands you at the *end* of the
alphabet. Observed first rows after one click on `Black`: `thug`, `maxiao888`, `bork`,
`bork`, `bork`. Two problems in one gesture. The convention — OGS, every file manager, every
spreadsheet — is that a newly-chosen text column sorts ascending first, and only toggles on
a second click; a user clicking "Black" to find Cho Chikun instead lands on the far end of
the alphabet with no indication why. Second, the sort affordance itself is invisible until
used: `sortIndicator()` returns an empty string for every non-active column, so four of five
headers give no hint that they are clickable at all — no chevron ghost, no cursor change
beyond the default, no `aria-sort`, and the header text is styled identically to the body
text (L12) so it does not even read as a header row. The click target is also the entire
label with `padding: 0` (L1), i.e. an 11px-tall strip of text.

And what the sort exposes is its own finding: the operator's casual online games (`bork`,
`thug`, `maxiao888`, `gnw3282g`, results `W+Forfeit` and `B+Time`) are interleaved directly
with GoGoD professional records (`Takemiya Masaki`) with **no source, collection, or origin
column anywhere in the table and no filter to separate them** — despite `GameSourceId` being
a first-class type in the model. A professional archive and a personal game history are two
different corpora with two different reasons to be browsed, and the Library presents them as
one undifferentiated 28,847-row stream.

---

## Closing note

The Library is not ugly in the way a surface is ugly when someone made questionable taste
calls. It is ugly in the way a surface is ugly **when its stylesheet did not execute and
nobody looked at the result** (L1), **when its most important data renders at zero width and
nobody noticed** (L2), and **when its core interaction was never built** (L4). Findings
L5, L6, L9, L10, L12, L13, L15 and L19 are all downstream of L1 alone. The remainder — the
219px placement, the empty-board preview, the White-first ordering, the modal on every open,
the raw archive strings, the ordinal in the first column — are independent design
judgements, and each of them departs from a settled genre convention without anything
resembling a justification for the departure.

*Ends. Remedies deliberately not proposed.*
