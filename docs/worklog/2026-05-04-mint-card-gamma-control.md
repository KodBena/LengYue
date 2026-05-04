# Mint-card modal gains a γ control

- **Status:** Shipped on `frontend/mint-card-gamma-control`,
  2026-05-04. Build green.
- **Genre:** Feature — surfaces the recall-discount γ as
  per-card editable at mint time. No backend / wire change.
- **Date:** 2026-05-04.

## Context

`gamma` (the recall-discount parameter Ebisu uses to weight
multi-move card scoring) was readable on `ReviewCard` since
the Item-18 ACL-surfacing closure on 2026-05-03 (`backend-
service.ts::mapToReviewCard`'s `?? 0.9` fallback), but had no
authoring control — every newly-minted card silently inherited
the backend's default for absent values. The user flagged
that gamma "should be settable when you mint a card."

The wire ride is opaque: `grading_parameter` on `CardCreate`
is OpenAPI-honest as `{[key: string]: unknown} | null`, the
backend stores the blob as-given, and the
read-side `mapToReviewCard` walks `data.gamma` back out. So
shipping a mint-time control is purely frontend-side — same
pattern as `data.default_visits`, which has been editable
since release-scope item 6.

## What changed

### `frontend/src/types.ts`

`MintingSettings` gains a `defaultGamma: number` field with a
JSDoc comment naming the value's role (modal-opens-with),
the per-card override path (`grading_parameter.data.gamma`),
and the read-side `?? 0.9` fallback alignment.

### `frontend/src/store/defaults.ts`

`defaultProfile.settings.minting.defaultGamma = 0.9`. Matches
the existing fallback in `mapToReviewCard` so the user-facing
semantics are unchanged for legacy cards that lack the field.

### `frontend/src/store/migrations.ts`

`CURRENT_SCHEMA_VERSION` bumped 12 → 13. New migration
appends `defaultGamma: 0.9` to `profile.settings.minting`
when absent (idempotent — a pre-existing numeric value is
preserved). The migration's docstring names the read-side
fallback alignment so future contributors see the
default's lineage.

Strictly speaking, `deepMerge` in `updateFromRemote` would
backfill the field via the default profile shape, so a v12
blob would render correctly even without the migration. The
migration ships anyway because the project's discipline is
"bump and migrate when adding fields" (see the v9→v10
PvAnimation precedent which had the same deepMerge fallback
property and shipped a migration anyway). Bump-and-migrate
keeps the schema-version marker honest about the data shape.

### `frontend/src/composables/useMinting.ts`

`prepareDraft` populates `grading_parameter.data.gamma` from
`mintingPrefs.defaultGamma` alongside the existing
`data.default_visits` line. The ordering follows the existing
pattern — palette-resolved fields go in first, per-card knobs
get merged in after.

### `frontend/src/components/MintCardModal.vue`

Three edits:

1. New typed accessor `gamma` mirroring the existing
   `defaultVisits` shape. Same opacity story (the wire
   type's `{[key: string]: unknown} | null` widens at the
   access boundary via a localized cast); same fallback
   value (0.9 if `data.gamma` is absent).
2. Template input bound to `gamma` with `min="0.01"
   max="1" step="0.01"`. Bounded range matches Ebisu's
   recall-discount semantics — γ ∈ (0, 1].
3. `submit`'s palette-override branch reads and re-attaches
   `data.gamma` alongside `data.default_visits` so a
   user-edited gamma isn't clobbered when the override
   rebuilds the blob from the chosen palette.

The label uses the unicode "γ" character (U+03B3 GREEK
SMALL LETTER GAMMA) for visual concision; it's the standard
notation for the recall-discount parameter in the Ebisu
literature.

## Why no backend dispatch

`CardCreate.grading_parameter` is OpenAPI-typed as
`{[key: string]: unknown} | null` (see `src/types/backend.ts`).
The backend tolerates arbitrary key/value pairs in the blob
and reads `data.gamma` from it via the same path the
frontend's `mapToReviewCard` uses (and presumably the
backend's grading code uses too — though that's outside the
frontend's scope). Adding a per-card gamma to the create
payload doesn't change the wire shape, so no schema renegotiation
or dispatch is needed.

If the backend's grading code defaults `gamma` differently
from 0.9 when absent (the legacy-card path), there's a small
silent semantic mismatch with the frontend's display. That's
a coordination question to surface separately if it
matters; it's not on the critical path for this feature.

## Verification

- `npm run build` (vue-tsc + vite build) clean.
- Manual: open a board, click Mint. The modal now shows a
  "Discount γ:" input below "Default Visits:", initialized
  from `profile.settings.minting.defaultGamma` (0.9 by
  default). Edit it; the value rides into the created
  card's `grading_parameter.data.gamma` and round-trips on
  the next read via `mapToReviewCard`.
- Migration sanity: a v12 blob with no `defaultGamma`
  hydrates cleanly; the migration sets `defaultGamma: 0.9`;
  the modal opens with that value. A v12 blob with
  `defaultGamma: 0.5` (hand-edited or future-shaped)
  preserves the user's value.
- Non-regression: `default_visits` editing still works;
  palette-override branch now preserves both `default_visits`
  AND `gamma` rather than just the former.
- Non-regression: legacy cards (created before this change,
  no `data.gamma` in their stored blob) continue to read as
  `gamma: 0.9` via `mapToReviewCard`'s `??` fallback.

## Forward notes

The user named two missing-control items: γ at mint time
(this PR) and middleware cache control (still TBD). The
cache-control item is a separate scope — likely involves
adding registry editor visibility for the proxy's
`cache` / `lookup_cache` flags, which currently get set
hardcoded in `analysisService.analyzeRange` and
`analyzeActiveNode` (`cache: false`, `lookup_cache:
false`). That's a small follow-up if/when picked up.

The broader "tighten the inner gradingParameter shape"
arc named in `handoff-current.md`'s "Rough edges" section
is still deferred. This PR adds another structured field
(`data.gamma: number`) to the blob's de-facto schema; if
the inner shape stabilizes further, a typed
`GradingParameter` interface in `types.ts` would consolidate
the localized casts at the access sites (currently four
distinct cast types across `backend-service.ts`,
`MintCardModal.vue`, and `useReviewSession.ts`). Not load-
bearing for this PR; the typed-schema decision is a
backend coordination question per the
`handoff-current.md` framing.
