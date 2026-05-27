# User-Configurable Keybindings — Design Note

- **Status:** `design-note: planning` — pre-implementation. Branch:
  `frontend/keybindings-plan`.
- **Date:** 2026-05-27.
- **Cross-references:**
  - `todo_local.gitignore` new #8b (the substrate half of the
    keybindings ask; #8a was the `n`-toggle quick win shipped
    2026-05-27 via PR #278).
  - `docs/notes/knob-registry-plan.md` (`design-note: implemented`)
    — sibling substrate; the action-registry shape borrows its
    declarative-decl posture.
  - `src/composables/useUserIORegistry.ts` — current hardcoded
    keybinding source; this plan describes its replacement /
    re-shaping.
  - `docs/worklog/2026-05-27-perf-fix1-raf-coalesce-keydown.md`
    — established the per-key dispatch-mode distinction (nav keys
    rAF-coalesce, toggles fire synchronously) the registry must
    preserve.

## Motivation

Two concerns this addresses simultaneously:

1. **Discoverability.** The current keybindings (currently 10
   actions across 12+ keys) live hardcoded inside
   `src/composables/useUserIORegistry.ts`'s switch statement.
   The project author knows them; nobody else does. Documentation
   is scattered: some bindings have inline comments next to their
   case, some are mentioned in `StatusBar.vue`'s tooltip strings,
   some are buried in commit messages, none surface as a
   user-facing reference. A new user has no way to learn what
   `m` does, or that `n` toggles move numbers, or that space
   toggles the ponder.

2. **User configurability.** Per `todo_local.gitignore` new #8b,
   the user wants to be able to rebind. This is a natural
   continuation of #8a (the `n` keybinding shipped 2026-05-27
   via PR #278); the comment on that PR explicitly named the
   substrate as the larger arc.

A single keybindings registry serves both purposes simultaneously:
the registry IS the documentation (rendered as a navigable
reference table in a new Settings sub-tab) AND the configurable
source of truth.

The user has called this "robust and strongly typed to the extent
it makes sense" — the design below leans into the
type-as-specification posture established by `frontend/CLAUDE.md`
(branded ids, discriminated unions, the knob-registry pattern).

## Surface restructure: Settings sub-tabs

Currently the Settings tab is a single flat surface (a
`<RegistryEditor>` mount inside `App.vue`'s Settings slot).
Following the Cards tab's Decks/Browse pattern, the surface
splits into sub-tabs:

- **General** — the current content (`<RegistryEditor>` mount,
  unchanged).
- **Keybindings** — new sub-tab; contains the keybindings
  registry editor surface (described in detail below).

The sub-tab infrastructure (an inner `TabWidget` mounted inside
the Settings slot, mirroring the Cards tab's pattern) is the
substrate; further sub-tabs (Display / Engine / etc.) can land
later as the surface grows. Out of scope for this arc.

### Why a sub-tab and not a separate top-level tab

Top-level tabs are scarce real estate; the current set (Library,
Cards, Settings, Analysis, Other) is a natural product taxonomy.
"Keybindings" doesn't deserve its own top-level slot — it's a
Settings concern. The sub-tab pattern preserves that and matches
the existing Cards-tab precedent.

## Keybindings substrate

### Action registry

The substrate's core type is a declarative `KeybindingActionDecl`.
Each action the SPA wants to be keyboard-triggerable registers
exactly once.

```ts
/** Stable identifier for a keybinding action — branded. */
export type KeybindingActionId = string & { readonly __actionBrand: unique symbol };

export interface KeybindingActionDecl {
  /** Stable id — must be unique across the registry. Naming
   *  convention: `<domain>.<verb>`, e.g., `nav.next`,
   *  `display.toggleMoveNumbers`, `engine.ponderToggle`. */
  readonly id: KeybindingActionId;

  /** i18n key for the user-visible action label. Rendered as
   *  the action's name in the Keybindings sub-tab. */
  readonly labelKey: string;

  /** i18n key for a sentence-length description of what the
   *  action does. Rendered in a tooltip / details row. */
  readonly descriptionKey: string;

  /** The action's default key as shipped. `null` for actions
   *  that ship unbound (the user can opt in by binding a key
   *  via the editor). */
  readonly defaultKey: string | null;

  /** Dispatch mode:
   *  - 'immediate' for toggles / one-shot actions; fires
   *    synchronously per keydown.
   *  - 'coalesced' for nav-style actions; rAF-coalesced
   *    against OS key-repeat so heavy downstream cost can't
   *    back-pressure the input queue. See
   *    docs/worklog/2026-05-27-perf-fix1-raf-coalesce-keydown.md
   *    for the established pattern. */
  readonly dispatchMode: 'immediate' | 'coalesced';

  /** When this action is dispatchable. Predicate enum keeps
   *  the surface declarative; if a fourth case shows up,
   *  promote to a callback `(store: GlobalStore) => boolean`. */
  readonly enabledWhen:
    | 'always'              // Pure display preferences (rare)
    | 'activeBoardExists'   // Most actions — gated on the
                            // `activeBoard.value !== null` check
                            // the current useUserIORegistry uses
    | 'engineConnected';    // Engine-dependent actions
                            // (ponder toggle)

  /** The action body. Pure side-effecting function over the
   *  reactive store; reads `activeBoard` / `store.engine` etc.
   *  directly. No parameters — context-dependent state is
   *  re-read at dispatch time (matches the rAF-coalesce
   *  posture of reading current state at fire time). */
  readonly handler: () => void;
}
```

### Action ids are branded literals

The `KeybindingActionId` brand prevents string typos from
silently selecting the wrong action. Concrete ids are minted via
a tiny factory:

```ts
export const asActionId = (id: string): KeybindingActionId =>
  id as KeybindingActionId;

export const ACTIONS = {
  navNext:                       asActionId('nav.next'),
  navPrev:                       asActionId('nav.prev'),
  navVariationNext:              asActionId('nav.variationNext'),
  navVariationPrev:              asActionId('nav.variationPrev'),
  navHome:                       asActionId('nav.home'),
  navEnd:                        asActionId('nav.end'),
  enginePonderToggle:            asActionId('engine.ponderToggle'),
  displayToggleMoveSuggestions:  asActionId('display.toggleMoveSuggestions'),
  displayToggleMoveNumbers:      asActionId('display.toggleMoveNumbers'),
  displayToggleOwnershipContinuous: asActionId('display.toggleOwnershipContinuous'),
  displayToggleOwnershipDots:    asActionId('display.toggleOwnershipDots'),
  displayToggleOwnershipLiveness:asActionId('display.toggleOwnershipLiveness'),
} as const satisfies Record<string, KeybindingActionId>;
```

The `as const satisfies Record<string, KeybindingActionId>`
shape gives both per-key literal narrowing AND constraint
enforcement (every entry IS an ActionId). Adding a new action
extends `ACTIONS`; the type system tracks it.

### Storage shape — user-side overrides

Persisted user overrides live on `AppSettings`:

```ts
interface AppSettings {
  // ... existing fields ...
  /** User-specified key for each action. Absence (or `null`)
   *  means "use the registry's defaultKey". This shape keeps
   *  the persisted blob minimal — fresh installs serialise to
   *  `{}`, and only deliberate user overrides take space. */
  keybindings: Partial<Record<KeybindingActionId, string | null>>;
}
```

Note `null` is a meaningful value (= "user has unbound this
action, even though it has a default"); absence is distinct
from null and means "user hasn't touched it, use default".

Schema bump (whatever the next migration number is) backfills
`keybindings: {}` on every legacy persisted blob. Per the
rolling-archive discipline, the same PR moves the
next-to-most-recent migration into `archived-migrations.ts`.

### Effective binding lookup

A pure helper resolves the effective key for an action:

```ts
export function effectiveKey(
  action: KeybindingActionDecl,
  overrides: Partial<Record<KeybindingActionId, string | null>>,
): string | null {
  if (action.id in overrides) return overrides[action.id] ?? null;
  return action.defaultKey;
}
```

Returns `null` when the action is unbound (either by default OR
by explicit user override). The dispatcher skips unbound actions
entirely — no keydown ever triggers them.

### Conflict handling

A "conflict" = two enabled actions claim the same effective key.
Detection runs at two points:

1. **Registration time** — a defensive check at module setup.
   If the default-bindings set has a conflict, that's a
   ship-time bug; throw per ADR-0002. Never expected to fire.
2. **User-edit time** — when the user assigns a key to an
   action via the editor, surface a UI warning ("This key is
   already bound to <other action>; rebinding it here will
   unbind <other action>") and offer the user a choice:
   confirm (and unbind the other) or cancel.

At dispatch time (per keydown), if a conflict somehow exists
(e.g., a user manually edited the persisted blob to introduce
one), the dispatcher picks the first match by `ACTIONS`
registration order and surfaces a one-time system-message
warning.

### Dispatch architecture

`useUserIORegistry` re-shapes from a hardcoded switch into a
registry-driven dispatcher:

```ts
export function useUserIORegistry() {
  // Reactive: rebuilds when the user changes a binding via the
  // editor. computed() because the key→action map depends on
  // both the static registry and the user overrides.
  const keyToAction = computed(() => {
    const overrides = store.profile.settings.keybindings;
    const map = new Map<string, KeybindingActionDecl>();
    for (const action of REGISTRY) {
      const key = effectiveKey(action, overrides);
      if (key !== null && !map.has(key)) map.set(key, action);
    }
    return map;
  });

  const rafState = { rafId: null as number | null, pendingKey: null as string | null };

  const handleKeyDown = (e: KeyboardEvent) => {
    // Context guards (form-control / contenteditable) unchanged.
    // ...
    const action = keyToAction.value.get(e.key);
    if (action === undefined) return;
    if (!isEnabled(action.enabledWhen)) return;
    e.preventDefault();
    if (action.dispatchMode === 'coalesced') {
      // rAF coalesce — same shape as today, but parameterised
      // on the latest pending action rather than the key.
      // ... (rAF dance) ...
    } else {
      action.handler();
    }
  };

  // mount / unmount: addEventListener / removeEventListener +
  // pending-rAF cleanup. Same shape as today.
}
```

The registry's per-action `handler` is what was previously in
`runAction`'s switch cases. Lifting each to a function pointer
in the decl keeps the dispatch loop short and the action
definitions co-located with their bindings.

### Modifier support — deferred

V1 ships single-key bindings only. The `effectiveKey: string`
shape captures what the current implementation supports (no
Ctrl / Shift / Alt). A future arc widens the shape to:

```ts
type KeySpec = { key: string; modifiers?: ReadonlyArray<'Ctrl' | 'Shift' | 'Alt' | 'Meta'> };
```

Storage shape can absorb the change with a forward-compat
migration; the registry shape grows a discriminator. Not in
scope for the first cut — keeps the editor UI simple and
matches the current keybinding inventory (no current binding
needs a modifier).

### Chord bindings — deferred

VSCode-style chord bindings (`Ctrl+K Ctrl+S`) are not in scope.
If a future user surface demands them, the dispatcher grows a
state machine; the storage shape grows further to allow
sequences. Out of scope for v1.

## Migration of existing keybindings to registry entries

Each of the current 12 cases in `useUserIORegistry::runAction`
becomes a `KeybindingActionDecl` in the registry:

| ActionId | Default key | Dispatch | Enabled | Handler reads/writes |
|---|---|---|---|---|
| `nav.next` | `ArrowDown` | coalesced | activeBoardExists | `nav.next()` |
| `nav.prev` | `ArrowUp` | coalesced | activeBoardExists | `nav.prev()` |
| `nav.variationPrev` | `ArrowLeft` | coalesced | activeBoardExists | `nav.variation(-1)` |
| `nav.variationNext` | `ArrowRight` | coalesced | activeBoardExists | `nav.variation(1)` |
| `nav.home` | `Home` | coalesced | activeBoardExists | `nav.home()` |
| `nav.end` | `End` | coalesced | activeBoardExists | `nav.end()` |
| `engine.ponderToggle` | `' '` (space) | immediate | engineConnected | `analysisService.isPondering` + start/stop |
| `display.toggleMoveSuggestions` | `m` | immediate | activeBoardExists | flip `store.session.ui.showMoveSuggestions` |
| `display.toggleMoveNumbers` | `n` | immediate | activeBoardExists | flip `store.session.ui.showStoneMoveNumbers` |
| `display.toggleOwnershipContinuous` | `c` | immediate | activeBoardExists | flip `store.session.ui.overlayLayers.ownership.continuous` |
| `display.toggleOwnershipDots` | `d` | immediate | activeBoardExists | flip `store.session.ui.overlayLayers.ownership.dots` |
| `display.toggleOwnershipLiveness` | `l` | immediate | activeBoardExists | flip `store.session.ui.overlayLayers.ownership.liveness` |

The current uppercase/lowercase duplicate-case pattern (`'m'`
AND `'M'`, etc.) folds into the dispatcher: at dispatch time,
the key lookup tries the literal first, then a lowercase
fallback. Or equivalently, the registry normalises uppercase
keys at registration time to their lowercase equivalent and
the dispatcher always lowercases. Either way, the user-facing
view of "the binding is `m`" stays unsurprising — the case
distinction is an implementation detail of how OSes report
shifted vs unshifted keys.

The rAF coalesce behaviour (Bug B fix from the 2026-05-27 perf
audit) is preserved: the `dispatchMode: 'coalesced'` actions
get the same per-frame back-pressure the current
`COALESCED_NAV_KEYS` set provides. The dispatcher's rAF
state remains a single shared slot — only the LAST coalesced
action in any one frame fires.

## UI: the Keybindings sub-tab

### Layout sketch

```
┌───────────────────────────────────────────────────────────────┐
│  General  │ Keybindings │                                     │  ← sub-tab strip
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  Search [_______________]                                     │
│                                                               │
│  ▾ Navigation                                                 │
│   Previous move ............... ArrowUp     [Edit] [Reset]    │
│   Next move ................... ArrowDown   [Edit] [Reset]    │
│   Previous variation .......... ArrowLeft   [Edit] [Reset]    │
│   Next variation .............. ArrowRight  [Edit] [Reset]    │
│   Jump to game start .......... Home        [Edit] [Reset]    │
│   Jump to game end ............ End         [Edit] [Reset]    │
│                                                               │
│  ▾ Display                                                    │
│   Toggle move suggestions ..... m           [Edit] [Reset]    │
│   Toggle move numbers ......... n           [Edit] [Reset]    │
│   Toggle ownership: continuous  c           [Edit] [Reset]    │
│   Toggle ownership: dots ...... d           [Edit] [Reset]    │
│   Toggle ownership: liveness .. l           [Edit] [Reset]    │
│                                                               │
│  ▾ Engine                                                     │
│   Toggle pondering ............ Space       [Edit] [Reset]    │
│                                                               │
│  [Reset all to defaults]                                      │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### Action rows

Each row shows: the action's i18n label (truncate-ellipsis with
hover-title for the full description), the current binding key,
and two buttons:

- **Edit** — opens an inline binding-capture flow. The row's
  key cell highlights with a "Press a key…" prompt; pressing
  a key records the new binding (with conflict check + warning
  surface per the "Conflict handling" section above before
  committing). The inline editor also surfaces an **Unbind**
  control adjacent to the capture prompt — clicking it stores
  the binding as `null` (per the storage shape's distinction
  between "absent = use default" and "null = explicit user
  unbind") so the action becomes unreachable from the keyboard
  even when it has a default. Escape cancels the capture
  without modifying the binding.

  Unbind folds into the Edit flow rather than living as a
  separate row-level button so each row stays visually
  compact at two controls — three buttons in a row was
  cluttered. The trade-off is one extra click to unbind
  (Edit → Unbind) vs (Unbind directly); acceptable because
  unbind is a less-common operation than rebind.

- **Reset** — restores the action's default binding (disabled
  if the current binding == the default).

### Domain grouping

Actions group by their `id` prefix's first segment (`nav`,
`display`, `engine`). The grouping is for UX only; the registry
shape is flat. New actions land in whichever section their
prefix names; new sections appear automatically.

### Search

A simple substring filter across action labels + descriptions
+ ids. Helps when the registry grows past a single screen.
Optional for v1 (~12 actions fit comfortably without search);
the placeholder reserves the surface.

### "Reset all" affordance

A single button at the bottom clears every entry in
`store.profile.settings.keybindings`, restoring the registry's
defaults uniformly. Confirms via the existing `ConfirmLoadModal`
pattern (or a fresh single-question modal) — the action is
destructive (loses every user customisation).

## Implementation plan

Phased landing for bisectability and to let intermediate state
ship without all the UI:

1. **Phase 1: Substrate.** Add the registry shape
   (`KeybindingActionDecl`, `ACTIONS` const, `effectiveKey`
   helper). Add the `keybindings` field to `AppSettings`. Schema
   migration. No behaviour change yet — `useUserIORegistry`
   keeps its hardcoded switch. The registry is built and
   `validateRegistry`'d at module setup (defensive ship-time
   conflict check).
2. **Phase 2: Dispatcher rewrite.** Rewrite
   `useUserIORegistry` to consume the registry. Behaviour
   equivalence with Phase 1 hardcoded: same keys, same
   actions, same dispatch modes. Existing manual tests
   confirm parity.
3. **Phase 3: Settings sub-tab.** Add the inner `TabWidget`
   to the Settings tab; wrap current content as "General";
   add empty "Keybindings" sub-tab that lists actions
   read-only (no edit yet). Discoverability lands here even
   without the edit affordance.
4. **Phase 4: Edit affordance.** Add the per-row Edit / Reset
   buttons + the binding-capture inline editor + conflict
   surface. Reset-all button.
5. **Phase 5: Tests.** Vitest integration tests for the
   dispatcher's behaviour (registry → keyToAction map →
   keydown dispatch). Particular attention to conflict
   resolution, enabledWhen gating, dispatchMode
   coalesce-vs-immediate.

Each phase ships as its own PR per the user's bisectability
preference. Phases 1 + 2 + 3 are pure-additive (no user-visible
behaviour change yet); Phase 4 lands the user-facing
customisation; Phase 5 is the safety net.

## What this composes with

- **Knob-registry pattern** (`docs/notes/knob-registry-plan.md`)
  — the action registry borrows the declarative-decl posture:
  each entry is self-describing, validation runs at registration
  time, the editor surface is a renderer over the registry.
  Different from knob registry in that actions are NOT
  user-extensible — the registry is a closed set the SPA
  ships; users only override the keys.
- **`useUserIORegistry`'s rAF-coalesce work** (perf Fix #1) —
  preserved exactly; the registry's `dispatchMode` field is
  literally the new home of the `COALESCED_NAV_KEYS` set.
- **i18n catalogs** — every action's label + description goes
  through `t(key)`; English source ships in `en.json`, other
  locales pick up in the next i18n sweep PR per the established
  per-locale-tier discipline.

## Considered but deferred — mousewheel / multi-modality

The board's mouse-wheel handler (via `useScopedScroll` mounted in
`TreeWidget.vue`) and the keyboard's ArrowUp/ArrowDown bindings
(via `useUserIORegistry`) both currently invoke `nav.next` and
`nav.prev`. The keybindings registry as designed above covers
the keyboard surface only — wheel events are a different DOM
event type, scoped to specific elements rather than `window`,
and don't fit the registry's `key: string` shape.

This means under the registry-driven design, the wheel handler
would continue to invoke `nav.next` / `nav.prev` directly (the
function references that the action handlers also point at),
NOT route through the registry's dispatch. Two input modalities,
one set of actions, two trigger paths.

A decision on whether to fold mousewheel into the registry — or
some other shape that unifies "user-input-modality → action"
across keyboard and wheel — is **deferred for want of more
careful design-space analysis**. The note here is to make three
things explicit:

1. **The interaction has been considered** — the registry isn't
   designed in ignorance of the wheel-as-nav input modality;
   the omission is intentional pending the deferred analysis.
2. **Implementation MUST be backwards-compatible** with the
   current mousewheel behaviour. The wheel handler keeps
   invoking `nav.next` / `nav.prev` (whether via registry or
   directly is the deferred-decision axis); the user-visible
   wheel-scroll-as-nav UX doesn't change as a side effect of
   the keybindings substrate landing.
3. **A completely unbiased micro-audit** should investigate
   whether this impedance (two input modalities, one set of
   actions, parallel trigger paths) is a code smell — and
   document the conclusion. Plausible outcomes range from
   "smell, unify under a broader input-action registry" through
   "intentional separation, document the boundary" to "smell
   but not worth the refactor cost". The audit's conclusion is
   the gate for whether mousewheel migrates into the registry
   in a future arc, stays separate by design, or motivates a
   different abstraction entirely. The conclusion lives in its
   own doc note when the audit lands.

The same impedance applies to mouse-button modalities (the
modifier-click and middle-click affordances on library rows and
PV suggestions), which the "What's NOT in scope" section below
flags separately. The deferred audit could naturally absorb
those too.

## Decisions

Resolved 2026-05-27 per user review (original "Open questions"
framing kept the prompts; the answers are committed below).
Deferred items are explicitly flagged.

1. **Action id format: `domain.verb`** (e.g., `nav.next`,
   `display.toggleMoveNumbers`, `engine.ponderToggle`). Matches
   the knob registry's `domain.knob` precedent loosely; reads
   naturally in tooltips, diagnostic logs, and persisted-blob
   inspection. Alternatives considered (kebab-case,
   single-segment, fully-namespaced) — not chosen.

2. **Inline-capture for the Edit affordance** (row highlights,
   capture next keypress; Unbind folds into the inline flow
   per the Action rows section above). Faster than a modal;
   matches the VSCode pattern this codebase's audience is
   likely familiar with. Modal-capture not chosen.

3. **Reserved "always-on" `enabledWhen` case** stays in the
   enum even though no current action uses it. Future actions
   whose dispatch should ignore the active-board /
   engine-connected gates have a place to land without
   widening the enum mid-feature.

4. **Reserved-key blacklist at editor time (Option (a))**.
   The Editor refuses to bind a small documented set of keys
   that are load-bearing for the SPA's other input surfaces
   (modal close via `Escape`, etc.). The blacklist's exact
   contents + the user-facing discovery surface (probably a
   "Reserved keys" disclosure in the sub-tab footer) resolve
   at Phase 4 implementation; the design here just commits to
   the approach. Options (b) "allow anything, user shoots
   themselves" and (c) "document but don't block" not
   chosen.

5. **Browser-default keybindings** (Ctrl+R reload, Ctrl+F
   find-in-page, etc.) — same blacklist approach extends to
   modifier-key combinations when modifier support lands in a
   future arc. Currently a non-issue (no current keybinding
   uses modifiers; the dispatcher's `e.preventDefault()` only
   runs for registry-bound keys). Flagged here so the
   future-arc that adds modifier support also extends the
   blacklist.

6. **Third "Reference" / "Cheatsheet" sub-tab — deferred.**
   The Keybindings sub-tab's table view already serves the
   reference role for the current ~12-action registry; a
   separate compact view doesn't add enough to justify its
   own surface yet. Reconsider if the registry grows past
   ~30 actions and the in-table reference becomes too
   scroll-heavy for at-a-glance lookup.

## What's NOT in scope

- Component-level / template tests for the sub-tab UI
  (per the established test posture in `frontend/CLAUDE.md`).
- Mouse-binding overrides (the modifier-click / middle-click
  pattern for library new-tab and PV-paste is its own
  substrate question; not folded in).
- Locale-specific keybindings (different defaults per locale).
- Cloud-sync of bindings across devices for the same user
  (SyncService handles this transparently as part of the
  profile blob; no extra work).
- Import / export of bindings (JSON file dump for sharing
  between users / installs). Future extension.

License: Public Domain (The Unlicense)
