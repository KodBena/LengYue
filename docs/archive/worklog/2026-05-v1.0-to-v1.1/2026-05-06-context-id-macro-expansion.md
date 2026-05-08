/**
 * docs/worklog/2026-05-06-context-id-macro-expansion.md
 * Worklog — context-id macro expansion in the Cards-tab text
 * input. `${gameSourceId, ...}` expands to the corresponding
 * root card ids client-side via the cached ForestStat[].
 * License: Public Domain (The Unlicense).
 */

# Context-id macro expansion (Cards tab)

- **Status:** Shipped on `frontend/context-id-macros`,
  2026-05-06. Three files touched (one new util, two
  modifications); build green; closes the
  filed-earlier-today TODO entry under Active Medium.
- **Genre:** Small UX feature. User prompt: "macro-expansion
  helper on the front-end, something like
  `${game_id_1,game_id_2, ...}` that will expand the context
  ids into the corresponding list."
- **Date:** 2026-05-06.

## What ships

A single macro syntax in the Cards-tab context-id text input:
`${N, M, ...}` (where N, M, ... are `game_source` ids) expands
to the comma-separated list of root card ids belonging to
those game_sources. Tokens outside macros pass through
unchanged.

```
"1, ${5}, 99"   →   "1, 100, 101, 102, 99"
(if game_source 5 has roots [100, 101, 102])
```

Pure frontend; no backend changes. Resolution uses the
cached `ForestStat[]` already loaded by
`backendService.getForestStats()` on Cards-tab mount.

## Scope clarification recorded inline

The earlier TODO entry (filed 2026-05-06 in the same
conversation) asked whether the richer case ("expand to all
cards under a game_source, including descendants") needed a
backend endpoint. The user clarified during the close-out
that the question was moot — context ids in the DSL are
already the "tree rooted at this card, including descendants"
shape (per `backend/docs/tree-dsl.md`'s description of the
`select` stage and its context-id pivots). So:

- The macro only needs to resolve `gameSourceId → rootCardIds`.
- The DSL handles descendant traversal automatically via its
  selection semantics.
- No backend round-trip needed; the simple case IS the case.

The TODO entry has been retired in this PR; the worklog
preserves the question and its resolution for future
historical reference.

## What changed

Three files. One new util, two modifications.

### `src/utils/context-id-macros.ts` — new file (60 lines)

Pure function `expandContextIdMacros(input, resolveGameSource)`
that runs a single regex-replace over the input string. The
resolver callback is the seam where the caller injects the
`ForestStat`-keyed lookup; the util itself doesn't import
anything Vue or store-related.

ADR-0002 carve-outs:

- Unknown `game_source` ids inside a macro silently expand to
  nothing. Per ADR-0002's documented exception #1 (UI input
  validation fallbacks), this is the right shape — the user
  can tell if a macro resolved by inspecting the resolved
  ids that appear in the input field after expansion. A bare
  typo'd id outside a macro behaves the same way the existing
  parser already treats malformed input: filtered out via
  `isNaN`.
- Unclosed macros (`${` without a matching `}`) leave the
  unclosed substring as-is — the regex requires a closing
  brace to match. Mid-typing this is a no-op for the macro
  portion; the surrounding text continues to parse normally,
  and `:value` reactivity preserves the user's in-progress
  typing because the bound value doesn't change between
  pre-close and post-close keystrokes.

### `src/components/ForestDirectory.vue`

- Imports the new `expandContextIdMacros` util.
- `updateContextIds` pre-expands macros via the util before
  the existing split-and-parse pipeline. Resolver is a closure
  over `roots.value` — filters by `gameSourceId`, maps to
  `rootCardId`, with the standard branded-id casts (`as unknown
  as number`).
- Input field's `placeholder` advertises the syntax
  (`"e.g. 3, 4, ${12}"`); `title` documents the resolution
  rule.

No template-level changes beyond the placeholder/title text.
Net SFC growth ~12 lines; the `useForestBrowsePolicy`
extraction from the redesign arc keeps the file from
ballooning further.

### `docs/notes/deferred-items.md` — refresh ADR-0007 queue

Adjacent staleness fix surfaced during this conversation:
the "Refactoring queue from ADR-0007" entry's line counts
were stale (App.vue claimed 591; current is 513 per the user
during the close-out conversation, with incremental refactor
work having been ongoing). Refreshed all listed counts to
2026-05-06 values and updated the "first target after B5"
framing — App.vue is no longer the highest-priority target;
PaletteEditor.vue (531) and useReviewSession.ts (483) are
the natural next targets when bandwidth opens up.

## Worked examples (the user's framing)

The motivating shape per the user's PostgreSQL db: a 276-root
"UNKNOWN_ORIGIN" `game_source` representing imports without
provenance. With this PR shipped:

- Typing `${42}` (where 42 is the UNKNOWN_ORIGIN bucket)
  expands to all 276 root card ids comma-separated. The DSL's
  select-by-context-id then traverses each root's descendants.
- Typing `${42, 43}` expands to the union of both
  game_sources' root cards.
- Typing `1, 2, ${42}, 99` mixes literal root card ids with
  expanded game-source handles — the parser produces a single
  flat list.

The expanded form is what gets persisted (not the macro
syntax). Re-editing requires the user to re-type the macro;
this is a deliberate v1 trade-off — persisting the macro form
would have required a different schema for `cardsContextIds`
(string instead of `number[]`) and a migration. If the loss
of the macro form during editing turns out to be annoying in
practice, that's a clean follow-on PR.

## Bug fix landed on the same branch (2026-05-06)

The first ship had a real bug: the input field rejected
non-digit characters, so the user couldn't actually type the
macro syntax at all. Surfaced when the user tested HMR-side
and reported "the input field doesn't allow writing anything
other than digits."

**Cause.** The original `:value="store.session.ui.cardsContextIds.join(', ')"`
binding made the DOM track the parsed-and-formatted store
value. Every non-digit keystroke produced a parser failure
that dropped chars; the bound value (the formatted store)
diverged from the user's literal typing; Vue's reactivity
stomped the DOM back to the parsed form. The user's `${`
typing was being erased on each keystroke before they could
finish the macro.

The trace I sketched in the original section above assumed
"Vue's `:value` only updates the DOM when the bound value
changes between renders" — true in some cases, but not when
the bound value diverges from the DOM's actual value at any
given render. The latter is what bit here. Lesson: don't
trust mental models of reactivity edge cases without testing.

**Fix.** Local `contextIdInput: Ref<string>` owns the input's
display value; `:value="contextIdInput"`. Writes flow
input → store one-way: every keystroke updates the local
ref (preserving typing) and re-parses into the store in
expanded form. The store-side ref stays the source of truth
for the deck pipeline; the local ref stays the source of
truth for what the user sees. No reverse watch (store →
input) — that would re-introduce the original stomp.

**Side effect of the fix.** The input now shows the user's
literal typing (including `${...}` macros) rather than the
parsed-and-formatted store value. The user has to glance
elsewhere to see what their macro resolved to. Closed by a
small "→ Expands to: …" hint paragraph that renders below
the input only when the input contains a `${...}` substring.
Cleaner UX than the original auto-replace-on-keystroke
behaviour, by accident — the macro form is now editable
rather than instantly destroyed by the parser.

**Persistence implication.** The macro form is preserved
during the session (the local ref retains it across panel
re-renders) but lost on reload (the local ref re-initializes
from `store.session.ui.cardsContextIds`, which holds the
expanded form). Same v1 trade-off as before, but with a
clearer separation between the in-flight edit state and the
persisted state — the macro form's session-lifetime is now
explicit rather than instantaneous.

## Verification

`npm run build` (`vue-tsc -b && vite build`) passes — the
util is pure TS, the SFC integration adds no new types, the
existing input binding flows through unchanged.

HMR smoke (deferred to user's session):

- Type `${42}` (or whichever your UNKNOWN_ORIGIN bucket id is) →
  the input field expands to that game_source's root card
  ids comma-separated.
- Mid-typing `${42` (no closing brace) preserves the typed
  text; expansion fires when `}` closes the macro.
- A typo'd id (`${999}` for a non-existent game_source)
  silently expands to nothing — visible as a missing
  contribution in the resolved field.
- The expanded list runs through the deck pipeline normally
  ("Run pipeline" / "Start Review Session" populate the right
  pane / kick off the SR session, same as before).

## Out of scope (deliberate)

- **Persisting the macro form.** v1 persists the expanded
  form; macro editing requires re-typing. See the trade-off
  note above.
- **Macro definitions inside `CardSet.pipeline`.** The macro
  applies only to the Cards-tab UI input. Pipelines defined
  in `defaults.ts` or via the registry editor consume raw
  `number[]` context ids; no macro support there. If user-
  authored decks want to encode "always run against game-source
  N" semantics, that's a different feature (parameter
  templating in pipelines).
- **A macro grammar beyond `${id, id, ...}`.** No nested
  macros, no operators, no tag-name aliasing. The simplest
  thing that earns its keep.

## License

Public Domain (The Unlicense).
