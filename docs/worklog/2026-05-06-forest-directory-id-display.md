/**
 * docs/worklog/2026-05-06-forest-directory-id-display.md
 * Worklog — surface gameSourceId / rootCardId inline in the
 * ForestTreeNav rows. Discoverability fix: ids are addressable
 * handles for the Cards-tab macro-expansion operator (`${N}`),
 * but the navigator was hiding them whenever a non-null
 * description was present.
 * License: Public Domain (The Unlicense).
 */

# Forest directory — surface ids inline

- **Status:** Shipped on `frontend/forest-directory-id-display`,
  2026-05-06. One file touched (template + styles); build green.
- **Genre:** Discoverability fix. User surfaced it when noticing
  that minted cards displayed under "Untitled Game" entries with
  no visible id, defeating the macro-expansion operator the
  cards-tab work introduced earlier today.
- **Date:** 2026-05-06.

## What ships

`ForestTreeNav.vue` now renders `gameSourceId` next to each
game's title (top-level row) and `rootCardId` next to each
root's title (expanded child row). Both ids surface as small
muted-text monospace `#N` chips inline with the title; visually
quiet, copy-pasteable, immediately addressable.

```
▾ Untitled Game            #42       3 roots  🗂️ 12  🔄 0
   Unnamed root            #100      Black vs White ...
   Unnamed root            #103      Black vs White ...
   Unnamed root            #107      Black vs White ...
```

## Why it matters

The Cards-tab context-id input accepts root-card ids directly
and game-source ids via the `${N}` macro operator (shipped in
the 2026-05-06 context-id-macro-expansion arc). Until this PR,
the user had no way to read either id from the UI — the
navigator's `titleFor()` only fell back to "Game source #N"
when EVERY root in the game had `description = null`, and the
root rows displayed `description || 'Unnamed root'` with no
id at all.

Combined with the separately-filed game-source dedup bug
(see `docs/dispatch/frontend-to-backend-game-source-dedup.md`),
the navigator was producing rows that looked like
"Untitled Game / Unnamed root" with no addressable handles —
the user couldn't reach for the macro operator even when they
wanted to. This PR closes the discoverability half of that
loop independently of the dedup fix; the two are decoupled.

## What changed

One file: `src/components/ForestTreeNav.vue`.

### Template — game row

```vue
<div class="game-title">
  <span class="game-title-text">{{ game.title }}</span>
  <span class="game-id" title="...">#{{ game.gameSourceId }}</span>
</div>
```

The wrapper `<div class="game-title">` flips to `display: flex`
with `align-items: baseline` so the id sits inline with the
title at the same baseline. `min-width: 0` on the wrapper +
`overflow: hidden; text-overflow: ellipsis` on the
`game-title-text` span lets the title ellipsis-truncate while
the id stays visible (`flex-shrink: 0` on the chip).

### Template — root row

Same shape applied to `root.stat.description || 'Unnamed root'`
+ `#{{ root.rootCardId }}`. Title text + id chip on one baseline.

### Styles

Two new classes:
- `.game-id, .root-id` — `var(--text-tiny)` size,
  `var(--text-2)` muted color, `var(--font-mono, monospace)`
  family, `flex-shrink: 0`.
- `.game-title-text, .root-title-text` — the title text spans
  that absorb the ellipsis behaviour previously on the parent.

The pre-existing `.game-title` and `.root-title` rules adjust
to flex-row containers with baseline-aligned children.

### Tooltip text

Both id chips carry `title=` tooltips that name the
addressable use:

- Game: `"Game source id — usable in the Cards-tab context-id field as ${N}"`
- Root: `"Root card id — usable directly in the Cards-tab context-id field"`

The user can hover to remember the macro syntax without
re-reading the docs.

## Out of scope (deliberate)

- **Game-source dedup.** The "two mints from one SGF → two
  Untitled Game entries with 1 root each" bug is a separate
  cross-boundary fix; sketched in
  `docs/dispatch/frontend-to-backend-game-source-dedup.md`.
  This PR makes the broken state navigable; the dispatch fixes
  the underlying cause.
- **Renaming "Untitled Game" / "Unnamed root" defaults.** The
  description field is what those fall back from; meaningful
  defaults live in `useMinting`'s draft construction and
  belong in the dedup arc (where the description is being
  reworked anyway as part of the user-friendly-name discussion
  per the same dispatch).
- **A copy-to-clipboard affordance on the id chips.** The
  monospace text + `title=` tooltips are sufficient for v1.
  If users start asking for a one-click copy, that's a
  small follow-on.

## Verification

- `npm run build` (`vue-tsc -b && vite build`) green.
- HMR smoke (deferred to user's session): open the Cards tab →
  Browse → expand a game node; verify both `#N` ids render
  inline with their titles, and that long titles still
  ellipsis-truncate without pushing the id off-screen.

## License

Public Domain (The Unlicense).
