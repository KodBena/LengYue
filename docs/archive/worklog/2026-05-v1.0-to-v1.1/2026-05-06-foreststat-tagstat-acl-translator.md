/**
 * docs/worklog/2026-05-06-foreststat-tagstat-acl-translator.md
 * Worklog — ForestStat / TagStat ACL translators close a structural
 * passthrough flagged by the 2026-05-03 class-wide audit. Pre-PR-0
 * of the Forest Directory hierarchical redesign arc.
 * License: Public Domain (The Unlicense).
 */

# ForestStat / TagStat — ACL translator close-out

- **Status:** Shipped on `frontend/foreststat-tagstat-acl`,
  2026-05-06. Five files touched, one new test-equivalent (the
  build is the verification surface); strict typecheck + vite
  build pass.
- **Genre:** Architectural discipline — closes the
  `deferred-items.md` entry "ForestStat / TagStat — wire-shape
  passthrough at the ACL boundary" surfaced 2026-05-03 during
  the class-wide ACL audit sweep that closed the 2026-05-02
  type-vs-implementation auditor entry.
- **Pre-PR-0** of the Forest Directory hierarchical redesign
  arc. The new navigator becomes the next concentrated
  `ForestStat` consumer; doing this fix first means the new code
  reads `s.rootCardId` rather than `s.root_card_id as CardId`.
- **Date:** 2026-05-06.

## Why this exists

`ForestStat` and `TagStat` were declared in `src/types.ts` with
snake_case fields kept verbatim from the wire shape, and there
was no ACL translator between `BackendService.getForestStats()`
/ `BackendService.getTags()` and consumers — the wire shape
*was* the domain shape. This violates the ACL discipline
documented in `frontend/CLAUDE.md` ("the ACL at
`src/services/backend-service.ts` is the boundary where backend
wire shapes (snake_case) become domain types (camelCase,
branded)") and surfaced in two practical ways:

- The domain type carried snake_case identifiers that read like
  wire shapes everywhere they appeared.
- Consumer sites carried inline `as CardId` brand-casts to
  bridge the un-branded wire `number` ids into the rest of the
  codebase. Three observed casts before the fix:
  `composables/useCardTreeData.ts:121` (`s.root_card_id as
  CardId`), `components/ForestDirectory.vue:74`
  (`roots.value[0].root_card_id as CardId`),
  `ForestDirectory.vue:255`
  (`root.root_card_id as CardId`).

The 2026-05-02 auditor's framing was that boundary translators
are the *only* place wire shapes should meet domain types in
this codebase; the typed-but-unassigned class (`gradingParameter`)
and the missing-translator class (this one) are sister
divergence shapes.

## What changed

Five files. Two translator additions plus three consumer
sweeps; type-shape rewrite at one source-of-truth.

### 1. `src/types.ts` — domain shape rewrite

`ForestStat` rewritten to camelCase with branded ids and
honest nullability:

```ts
export interface ForestStat {
  readonly rootCardId: CardId;
  readonly gameSourceId: GameSourceId;
  readonly description: string | null;
  readonly playerWhite: string | null;
  readonly playerBlack: string | null;
  readonly totalCards: number;
  readonly totalReviews: number;
  readonly averageRecall: number;
}
```

Three deliberate calls recorded inline at the type declaration:

- **Brand the ids, not the counts.** `rootCardId` and
  `gameSourceId` get brands because confusing them is a
  meaningful class of bug; `totalCards` / `totalReviews` /
  `averageRecall` stay bare per the entry's own "brand the
  meaningful, not the trivial" recommendation.
- **Preserve nullable metadata.** The wire ships `description`,
  `player_white`, `player_black` as `string | null` (from the
  generated `components['schemas']['ForestStat']`). The pre-fix
  domain type lied about this — declared as bare `string`. The
  fix preserves nullability per ADR-0002 ("ACL boundaries
  validate, not coerce"); consumers handle "no metadata" at the
  presentation boundary (`root.description || 'Unknown Game'`,
  `root.playerBlack || '?'`), where the substitution decision
  belongs.
- **TagStat shape unchanged.** Wire and domain are field-for-
  field identical (no snake_case to translate, no ids to brand).
  A doc comment names the passthrough explicitly so future
  readers don't conclude the ACL skipped this type by oversight
  — see the "TagStat asymmetry" note below.

### 2. `src/services/backend-service.ts` — translators wired

Two wire aliases added: `ForestStatWire`, `TagStatWire`. Two
private translator methods follow the `mapResolvedRoot` shape
already in the file:

```ts
private mapForestStat(raw: ForestStatWire): ForestStat {
  return {
    rootCardId: raw.root_card_id as CardId,
    gameSourceId: raw.game_source_id as GameSourceId,
    description: raw.description,
    playerWhite: raw.player_white,
    playerBlack: raw.player_black,
    totalCards: raw.total_cards,
    totalReviews: raw.total_reviews,
    averageRecall: raw.average_recall,
  };
}
```

`getForestStats()` / `getTags()` rewrite their bodies to fetch
the wire-typed array and `.map(...)` through the translator.

### 3. Three consumer sweeps

- **`composables/useCardTreeData.ts:121`** — `s.root_card_id as
  CardId` becomes `s.rootCardId`. The brand-cast is gone; the
  field is already branded at the ACL.
- **`components/ForestDirectory.vue`** — three sites:
  - `selectRoot(roots.value[0].rootCardId)` (the onMounted
    initial select; cast removed).
  - The Roots-tab `<div v-for>` template (key, active-class,
    click handler, three stat displays). Snake_case → camelCase
    across seven attribute / interpolation sites; one
    `as CardId` cast removed.
  - `activeRootId` ref tightens from `Ref<number | null>` to
    `Ref<CardId | null>`; the `as unknown as number` brand-
    laundering inside `selectRoot` retires.
- **`components/charts/card-tree-echarts.ts:220-221`** — the
  per-tree header tooltip composer renames `stat?.player_black`
  / `stat?.player_white` to camelCase.

## TagStat asymmetry — recorded honestly

`mapTagStat` is a structural no-op: wire and domain types are
identical, and the translator just copies fields. Adding it
flirts with ADR-0002's spirit (looks like ACL work, does none).
The deferred-items entry's framing — "the ACL is the only place
wire shapes meet domain types; these two interfaces skip the
boundary entirely" — won the call. The forward-looking argument:
if the backend ever renames `name` → `tag_name` or adds a
field, the translator is the place to absorb it without
rippling through the two consumer sites
(`useAppBootstrap.ts::getTags()` then `tags.map(t => t.name)`,
plus the downstream `store.profile.knownTags: string[]` Set
construction in `useMinting.ts`).

The honesty fix: doc comments at both the type declaration and
the translator name the redundancy explicitly. A future reader
who wonders "why does this translator exist when it just copies
fields?" gets the answer at the read site.

The retroactive convention (filed in the deferred-items closure
note): future ACL passthroughs that share field shapes with the
wire by accident still get a translator stub, with a doc
comment naming the redundancy.

## Verification

`npm run build` (`vue-tsc -b && vite build`) passes — strict
typecheck happy under the new branded shape, vite bundle
builds clean. No runtime change at consumer sites; `||`
fallbacks for nullable metadata continue to work because empty
string and `null` both fall to the fallback.

## License

Public Domain (The Unlicense).
