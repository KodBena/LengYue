# Frontend Changes — Ebisu API Rename (wire change)

## TL;DR

The Ebisu backend is renaming two wire fields from Go-specific names
to domain-neutral ones. The frontend needs to update four files. All
other frontend code is unchanged. Internal TypeScript type names
(`ReviewCard.sgf`, `ReviewCard.defaultVisits`, etc.) **stay the same**
— the anti-corruption layer in `services/ebisu-service.ts` is the
only translation point.

The backend will run in a transition window where it accepts **both**
old and new names for a period of time, so the frontend change can be
deployed independently without breaking anything.

## What's changing on the wire

Two field names are being renamed, and one field is being relocated:

| Field | Old location | New location |
|---|---|---|
| SGF content | top-level `sgf` (request), `normalized_sgf` (response) | top-level `raw_content` (request), `canonical_content` (response) |
| Default KataGo visits | top-level `default_visits` | nested `grading_parameter.data.default_visits` |

The backend is doing this to become domain-agnostic (so the same
codebase could back a Chess or Shogi app in the future). The frontend
is NOT going domain-agnostic — you're still a Go app. We're just
renaming the seam where you talk to the backend.

## The four files to change

### 1. `src/types.ts` — `CardCreatePayload` interface

Rename `sgf` → `raw_content`, remove top-level `default_visits`.

**Before:**
```typescript
export interface CardCreatePayload {
  sgf: string;
  num_moves: number;
  default_visits: number;
  grading_parameter: Record<string, any>;
  tags: string[];
  parent_card_id?: number;
  game_metadata?: GameMetadataPayload;
}
```

**After:**
```typescript
export interface CardCreatePayload {
  raw_content: string;
  num_moves: number;
  grading_parameter: Record<string, any>;
  tags: string[];
  parent_card_id?: number;
  game_metadata?: GameMetadataPayload;
}
```

`default_visits` no longer appears at the top level — it's now
expected to live inside `grading_parameter.data` (see the minting
code change below).

### 2. `src/composables/useMinting.ts` — payload construction

Search in `prepareDraft` for the `return { sgf, num_moves, ... }`
block and update it to produce the new shape. The `sgf` local
variable (from `serializeActivePath`) stays as-is; only the payload
key changes.

**Before** (inside `prepareDraft`, near the bottom):
```typescript
// 3. Resolve Palette (Grading Parameter)
const mintingPrefs = store.profile.settings.minting;
const env = store.profile.settings.engine.katago.analysis_env;

// Default to the currently active UI config
let grading_parameter = { data: { analysis_config: compileAnalysisConfig() } };

// If the user specified a specific default palette, compile just that one
if (mintingPrefs.defaultPaletteId !== 'active') {
  const specificPalette = env.palettes.find(p => p.id === mintingPrefs.defaultPaletteId);
  if (specificPalette) {
    grading_parameter = {
      data: {
        analysis_config: {
          bindings: {
            delta_fn: specificPalette.delta_fn,
            state_fns: specificPalette.state_fns,
            summary_fn: specificPalette.summary_fn
          },
          parameters: env.parameters,
          symbols: env.symbols
        }
      }
    };
  }
}

return {
  sgf,
  num_moves: mintingPrefs.defaultNumMoves,
  default_visits: mintingPrefs.defaultVisits,
  grading_parameter,
  tags: [],
  parent_card_id,
  game_metadata
};
```

**After:**
```typescript
// 3. Resolve Palette (Grading Parameter)
const mintingPrefs = store.profile.settings.minting;
const env = store.profile.settings.engine.katago.analysis_env;

// Default to the currently active UI config
let grading_parameter: Record<string, any> = {
  data: { analysis_config: compileAnalysisConfig() }
};

// If the user specified a specific default palette, compile just that one
if (mintingPrefs.defaultPaletteId !== 'active') {
  const specificPalette = env.palettes.find(p => p.id === mintingPrefs.defaultPaletteId);
  if (specificPalette) {
    grading_parameter = {
      data: {
        analysis_config: {
          bindings: {
            delta_fn: specificPalette.delta_fn,
            state_fns: specificPalette.state_fns,
            summary_fn: specificPalette.summary_fn
          },
          parameters: env.parameters,
          symbols: env.symbols
        }
      }
    };
  }
}

// Merge default_visits into grading_parameter.data — it lives there
// now instead of at the top level of the payload.
grading_parameter.data.default_visits = mintingPrefs.defaultVisits;

return {
  raw_content: sgf,
  num_moves: mintingPrefs.defaultNumMoves,
  grading_parameter,
  tags: [],
  parent_card_id,
  game_metadata
};
```

Notable points:
- The `sgf` local variable still exists — it holds the string from
  `serializeActivePath(board)`. Only the payload key name changes.
- `grading_parameter` gets a widening TypeScript annotation
  (`Record<string, any>`) because we now mutate it (adding
  `default_visits`) after construction.
- `default_visits` is merged in at the end, just before the return.

### 3. `src/components/MintCardModal.vue` — form binding for visits input

The form previously bound `v-model.number="draft.default_visits"`.
After the `CardCreatePayload` shape change, that path doesn't exist
anymore. Bind to the nested location instead.

**Before** (around line 3531 in the template):
```html
<label>Default Visits:</label>
<input type="number" v-model.number="draft.default_visits" min="1" step="100" class="dark-input" />
```

**After:**
```html
<label>Default Visits:</label>
<input type="number" v-model.number="draft.grading_parameter.data.default_visits" min="1" step="100" class="dark-input" />
```

This works because `useMinting.prepareDraft` always constructs
`grading_parameter.data` before returning the draft (and now populates
`default_visits` inside it), so the path is guaranteed to exist at the
time the modal renders.

If TypeScript complains about the binding because
`grading_parameter` is `Record<string, any>`, that's fine — the `any`
type lets this pass. If you want stronger typing, define:

```typescript
interface GradingParameterPayload {
  data: {
    default_visits: number;
    analysis_config: Record<string, any>;
  };
}
```

and replace `Record<string, any>` in the `CardCreatePayload` interface.
Optional — not strictly required for the change to work.

### 4. `src/services/ebisu-service.ts` — ACL mapping (mapToReviewCard)

Update the field-source names. Use a fallback chain so this code is
tolerant of both the transition-window backend (which sends both old
and new names) and of future states where only new names are sent.

**Before** (in `mapToReviewCard`):
```typescript
return {
  id: raw.id as CardId,
  sgf: raw.normalized_sgf || raw.sgf,
  numMoves: raw.num_moves,
  parentId: raw.card_source_id as CardId | undefined,
  model: { alpha: raw.alpha, beta: raw.beta, t: raw.t },
  lastReviewedAt: raw.last_reviewed_at ? new Date(raw.last_reviewed_at) : null,
  numReviews: raw.num_reviews,
  suspended: raw.suspended,
  defaultVisits: raw.default_visits,
  gamma: raw.grading_parameter?.data?.gamma ?? 0.9,
};
```

**After:**
```typescript
return {
  id: raw.id as CardId,
  sgf: raw.canonical_content ?? raw.normalized_sgf ?? raw.sgf,
  numMoves: raw.num_moves,
  parentId: raw.card_source_id as CardId | undefined,
  model: { alpha: raw.alpha, beta: raw.beta, t: raw.t },
  lastReviewedAt: raw.last_reviewed_at ? new Date(raw.last_reviewed_at) : null,
  numReviews: raw.num_reviews,
  suspended: raw.suspended,
  defaultVisits: raw.grading_parameter?.data?.default_visits ?? raw.default_visits ?? 1000,
  gamma: raw.grading_parameter?.data?.gamma ?? 0.9,
};
```

Notable points:
- The fallback chain (`?? raw.normalized_sgf ?? raw.sgf`) tolerates
  any backend state. Remove the fallbacks later (a cleanup PR) once
  the backend's cleanup commit has been live for a while.
- `raw.grading_parameter?.data?.default_visits` is the new canonical
  read path. Fallback to top-level `raw.default_visits` covers the
  case where an older backend response doesn't have the nested value
  yet. The final fallback (`?? 1000`) covers the edge where neither
  is present.
- `ReviewCard.sgf` and `ReviewCard.defaultVisits` keep their names.
  Everything downstream (LineageTreeChart, the thumbnail tooltip,
  `useReviewSession`, etc.) that reads `card.sgf` or `card.defaultVisits`
  is unchanged.

## What does NOT change

The following files reference `card.sgf`, `card.defaultVisits`, or
both, and require **zero** changes — because they reference the
internal `ReviewCard` type, not the wire format:

- `src/components/charts/LineageTreeChart.vue` (tooltip formatter using `card.sgf`, `card.defaultVisits`)
- `src/composables/useReviewSession.ts` (SGF parsing via `card.sgf`; visits via `currentCard.value?.defaultVisits`)
- `src/App.vue` (SGF parsing via `card.sgf` in the load-card handler)
- `src/composables/useSgfLoader.ts` (`input.accept = '.sgf'` — file extension, not a field reference; stays as-is)
- `src/components/BoardDisplay.vue`, `BoardThumbnail.vue`, and other consumers of `ReviewCard`

Also unchanged:
- The `ReviewCard` interface in `types.ts`
- All KataGo-facing code (the `visits` parameter passed to the analysis service comes from `currentCard.value?.defaultVisits`, which is still populated correctly via the updated ACL)
- The Tag DSL, pipeline DSL, forest query shapes — those wire contracts are unchanged

## Testing checklist

After making the four changes above, verify via the browser DevTools
Network panel:

1. **Mint a new card.** Outgoing `POST /cards/` request body:
   - ✅ Has `raw_content` (not `sgf`)
   - ✅ Has `default_visits` INSIDE `grading_parameter.data` (not at the top level)
   - ✅ Returns `201 Created` with `{"status": "created", "card_id": <number>}`

2. **Fetch an existing card.** `GET /cards/<id>` response:
   - ✅ Has BOTH `canonical_content` and `normalized_sgf` (during the transition)
   - ✅ The card displays correctly on the board (confirms ACL read worked)
   - ✅ The "Default Visits" value shown in tooltips matches what was saved

3. **Submit a review.** `POST /cards/<id>/review`:
   - ✅ Response is parsed correctly (same ACL as GET)
   - ✅ KataGo analysis uses the correct visits count
     (check the analysis service call's `visits` parameter)

4. **Query a forest.** `POST /forests/query`:
   - ✅ Returned cards display correctly
   - ✅ Thumbnail tooltips show the SGF content and visit counts correctly

5. **Sanity check on a freshly-reloaded browser.** Hard-refresh
   (Cmd+Shift+R / Ctrl+Shift+R) to clear any cached JS bundle, then
   re-run tests 1–4. This confirms the frontend isn't accidentally
   relying on a stale cached version.

## Deploy coordination with the backend team

The backend is deploying this change in three phases:

| Phase | What backend does | What frontend sees |
|---|---|---|
| **Phase 1** | Accepts both old and new names; emits both in responses | Your old code still works. Your new code also works. Deploy whenever. |
| **Phase 2** | (This is your deploy.) Frontend speaks new vocabulary. | |
| **Phase 3** | Stops accepting old request names (`sgf` on input is rejected; `default_visits` top-level is rejected). Response side keeps emitting both for a while longer to protect stale browser caches. | If you haven't deployed Phase 2 yet, submissions will break. If you have, everything keeps working. |

The backend team will confirm with you when Phase 1 is live in production — **deploy Phase 2 (your change) any time after that**. There is no rush; Phase 1 is indefinite.

**Coordinate the Phase 3 deploy** with the backend team — they'll
want confirmation that users have picked up your frontend change
before they tighten requests. A day or two is usually sufficient for
SPA-style apps where the browser refetches the JS bundle on reload.

## Rollback

If your Phase 2 deploy has problems, revert it. The backend's
Phase 1 dual-accept means your reverted (old-vocabulary) frontend
still works against the Phase 1 backend. No backend rollback needed.

If problems appear only in production after Phase 3 — meaning a user
has a stale cached frontend that still tries to submit with
`sgf`/top-level `default_visits` — they'll see a `422 Unprocessable
Entity` with the offending field name in the error body. The fix is
a hard-refresh on their end. The clean error message is the design:
a stale client gets a clear diagnostic, not a cryptic crash.

## Questions

If any of the above is ambiguous, or if the four file changes don't
match what you see in your local checkout (e.g., line numbers have
drifted, the existing code differs from the "Before" snippets), ping
the backend team before proceeding. The change is straightforward
but the safest way to verify is with a diff against a clean test
environment.
