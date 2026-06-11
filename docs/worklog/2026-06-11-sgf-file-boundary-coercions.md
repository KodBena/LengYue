# Worklog — sgf-file-boundary-coercions: three silent coercions on the SGF file-trust boundary (2026-06-11)

> Audit trail for work-status item `sgf-file-boundary-coercions`; branch
> `bork/fix/sgf-file-boundary-coercions`, PR (TBD). Closes the three
> file-trust-boundary coercions flagged by the 2026-06-11 debt
> second-opinion review (row 3 of its triage sweep,
> `docs/notes/audit/audit-debt-second-opinion-2026-06-11.md`), plus a
> fourth-instance tolerance fix the out-of-frame hack-rationalization
> audit surfaced.

## Frame

ADR-0002's UI-input-validation exception does **not** apply to file
contents: a corrupt SGF is not a structurally-impossible UI input but
untrusted *file* data, so the boundary must fail loudly rather than
coerce. The three coercions, verbatim from the item:

1. `sgf-loader.ts:16` — `parseInt(SZ)` guards absence (`?? '19'`) but not
   malformation; `SZ[garbage]` yields `NaN` propagating into board
   geometry.
2. `engine/util.ts::sgfToMove` — `charCodeAt - 97` arithmetic with no
   bounds validation; downstream `validateMove` rejects most pathological
   *placements* but setup stones bypass it.
3. `sgf-loader.ts:142` — the only illegal-move notice is gated under
   `import.meta.env.DEV`; production silently skips the move.

In-codebase contrast named by the item: `getKomi` guards `isNaN` (but
*falls back*). The decision below records, per the item's instruction,
why SZ does **not** fall back where komi does.

## Channel decisions (ADR-0002 loudness hierarchy)

I studied how the loader's callers surface load failures before choosing.
All six `loadSgf` callers already wrap the call in `try/catch`
(`useSgfLoader.loadFile`, `useReviewSession.loadCard`,
`useLibraryPreview`, `useCardThumbnail`, `loadSgfIntoBoard` /
`useDirtyBoardGuard`, the perf harness). `loadSgfIntoBoard`'s header
already declares the fail-loud contract ("parse / load errors
propagate"). So **throwing** is the idiom the call graph is built around;
the two genuine user-facing catches surface the throw at level 4.

| Coercion | Chosen channel | One-line rationale |
|---|---|---|
| (1) `SZ[garbage]` | **Throw `SgfSizeError`** (level 3) → surfaced level 4 at the two user-facing catches | SZ is load-bearing geometry; a `NaN` size structurally corrupts every coordinate/rules computation — refusing beats guessing "probably 19" (the anti-pattern ADR-0002 names). **Deliberately not a fallback** unlike `getKomi`: komi is a scalar scoring parameter (a wrong default mis-scores one number, board still plays); SZ indexes everything, so a wrong default is corruption, not degradation. The asymmetry is justified in a comment at `SgfSizeError`'s declaration (ADR-0002 Rule 7 — surface the closest-match/level decision, don't leave it inferred). |
| (2) `sgfToMove` arithmetic | **Throw `SgfCoordinateError`** (level 3) at the loader; **skip-and-warn** (level 5) at analysis-time re-readers | Malformed coord at the *load* boundary fails loud; at *post-load* re-readers (`getInitialStones`) it tolerates — see the fourth-instance fix below. |
| (3) DEV-only illegal-move notice | **`console.warn` always-on** (level 5, prod-visible), per-node detail | Drops the DEV gate so production no longer silently skips. Kept the per-node detail (node id + coord + rules-engine reason) rather than collapsing to a bare count — ADR-0002 Revisit-when #2 warns that aggregating distinct anomalies into one message loses the specificity that makes the record actionable. An illegal move in an otherwise-loadable file is the *renderable-but-anomalous* class (board renders minus the move), matching the in-file `decodeBoardArray` precedent (level-5 console.warn, not a user toast). |

Level-4 user surfacing was wired into the two genuine file-load catches —
`useSgfLoader.loadFile` (file pick; was `console.error`-only, so a user
who picked a broken file saw *nothing*) and `useReviewSession.loadCard`
(was status-reset + `console.error`; the user stared at an unchanged
board with no explanation). Both now `pushSystemMessage('error',
i18n.global.t('sgf.loadFailed', { detail }))`, mirroring the sibling
`useSgfDownload` save-error idiom exactly. Thumbnails (no toast surface),
library preview (placeholder is the surface), and the headless perf
harness keep their existing posture.

## Out-of-frame audit and the fourth-instance fix

Per the umbrella's generality discipline (and because the illegal-move
notice is a slot with more than one possible surfacing channel), I ran
`hack-rationalization-detector` **out of frame** — a separate subagent
that had not seen my reasoning, with my plan as the object of suspicion.
The tells scanner flagged "out of scope"/"follow-up" near "deeper fix" in
my draft justification (channel 3). The auditor's load-bearing finding,
which I had **not** accounted for and would have shipped:

> `sgfToMove`'s new throw reaches `getInitialStones` (`util.ts`), called
> from `analysis-service.ts` `analyzeRange` (`:542`) and the realtime
> ponder/Follow-Me path (`:787`) — **neither behind a `try/catch`** — on
> boards rehydrated from persistence that never re-ran `loadSgf` this
> session. A board loaded under the old silently-coercing code,
> persisted, and rehydrated, now carries a malformed `AB` string that
> throws on every navigation, crashing the analysis hot path.

Verified concretely: both `getInitialStones` call sites in
`analysis-service.ts` are unguarded; the rehydration path
(`store/index.ts` `normalizeBoard`) does not re-run `loadSgf`. The fix
states the boundary as one invariant rather than N patches:

**The SGF file-trust boundary is `loadSgf`; a board that has loaded is
geometry-clean. Post-load re-readers never re-throw on a loaded board.**

So `getInitialStones` now catches `SgfCoordinateError`, skips that one
setup stone with a `console.warn` (level 5), and proceeds — the same
fail-at-load / tolerate-at-re-read split ADR-0002's stale-bundle-shim
exception codifies. The load-time boundary already had its loud chance.

The auditor's other findings, dispositioned: the SZ-vs-komi asymmetry
now carries its justifying comment (done); the per-node-detail-vs-count
concern is honored (per-node detail kept); the perf-fixture audit is
clean (`buildSpacedFixtureSgf` is `SZ[19]` with valid a..s coords — the
full suite confirms no fixture hard-fails under the throws).

## The change

- `src/engine/util.ts` — `SgfCoordinateError` (exported); `sgfToMove`
  validates length + decoded bounds and throws on malformation (passes —
  empty / whitespace / `tt` on ≤19×19 — still resolve to a pass;
  `tt`-as-real-coord on >19×19 still decodes); `getInitialStones`
  refactored to a DRY `collect` helper that skips-and-warns on
  `SgfCoordinateError`. File header unchanged (already ADR-0006-compliant).
- `src/engine/sgf-loader.ts` — `SgfSizeError` (exported); `parseBoardSize`
  helper (absent → 19, malformed → throw, non-square `w:h` → throw via
  round-trip guard); the illegal-move notice drops its DEV gate and gains
  per-node detail. File header expanded to document the two-class
  file-trust contract (ADR-0006).
- `src/composables/sgf/useSgfLoader.ts` — catch now
  `pushSystemMessage('error', …)` + i18n; imports added.
- `src/composables/review/useReviewSession.ts` — `loadCard` catch now
  `pushSystemMessage('error', …)` (both `pushSystemMessage` and `i18n`
  already imported).
- `src/locales/en.json` — new key `sgf.loadFailed`. (CJK catalogs ship as
  thin/`{}` pending native-speaker review per `i18n/index.ts`; en is the
  fully-populated catalog. `ja`/`ko`/`zh-CN` fall back to `en` via
  vue-i18n's `fallbackLocale`.)

## Test

Tier-1 pure-logic fixtures (the named requirement):

- `tests/unit/engine/sgf-loader.test.ts` — malformed `SZ[foo]` / `SZ[0]` /
  `SZ[19:13]` throw `SgfSizeError`; absent SZ still defaults to 19;
  out-of-bounds / single-char / setup-stone coords throw
  `SgfCoordinateError`; an illegal move (`B[as];W[as]`, occupied point)
  loads, skips, and warns prod-visibly with per-node detail.
- `tests/unit/engine/util.test.ts` — `sgfToMove` throws on
  out-of-bounds / single-char / non-alphabet coords, still accepts
  `tt` as a real coord on 25×25; `getInitialStones` **skips** a malformed
  setup coord with a warning rather than throwing (the fourth-instance
  tolerance).

## Red / green

- `npm run build` (vue-tsc -b + vite): clean, strict typecheck passes, no
  new diagnostics.
- `npx eslint .`: exit 0.
- `npm run test:run`: **991 passed | 4 skipped (995)**, 0 failed. 48 of
  those are the two affected engine files (was ~28 pre-change; ~20 new
  cases). No existing test regressed — the throws break nothing, since
  all production fixtures carry valid SZ + coords.

## Fourth-instance findings (item asked to surface any)

Reading both files in full, the genuine *inbound* file-trust coordinate
boundaries are exactly the three named. Two adjacent shapes are NOT new
coercions of the same class:

- `sgf-loader.ts:53` (`posKey.split(',').map(Number)` →
  `String.fromCharCode(97 + x)`) *re-encodes* internal keys already
  produced by `sgfToMove`; it inherits the bound from coercion (2) rather
  than reading raw file data.
- `util.ts::getBoardSize` (`parseInt(SZ)` on an *already-loaded*
  `BoardState`) is the same `parseInt(SZ)` shape as coercion (1) but reads
  post-load derived data, not the file boundary. By the new load invariant
  a loaded board's SZ already round-tripped through `parseBoardSize`, so
  re-validating there would re-litigate at the wrong layer — left as-is,
  deliberately (same tolerate-at-re-read posture as `getInitialStones`).

The one fourth instance that *was* squarely the same class — the
`getInitialStones` re-read of raw `AB`/`AW` on rehydrated boards — was the
auditor's load-bearing finding and is fixed in this arc (tolerate, don't
re-throw), since it is the post-load mirror of coercion (2) and shipping
the throw without it would have introduced an analysis-path crash.

## Deferrals

None. No `not-filed:` markers.

## Documentation audit

- Work-status store: `sgf-file-boundary-coercions` left **read-only**
  (touching the `todo` DB is out of scope for this session per the
  commission); coordinator closes on ship.
- `frontend/FILES.md`: no new / moved / deleted `src/` file; no band
  drift (two error classes added within existing Band-3 files —
  `engine/util.ts`, `engine/sgf-loader.ts` — is not a re-tag). No edit.
- `frontend/IDENTIFIERS.md`: no new branded identifier type (the two new
  classes are `Error` subclasses, not branded ids).
- `FEATURES.md`: no user-facing capability *added* — the user-visible
  "could not load the SGF file" message makes an existing failure honest
  rather than introducing a new surface; pure ADR-0002 hardening, below
  the "would a Go player misunderstand the offering" bar.
- `docs/handoff-current.md`: no orientation-surface change.
- Doc-graph: this worklog is a new structural node; doc-graph regenerated
  in the same commit (`node tools/doc-graph/generate.mjs`).

License: Public Domain (The Unlicense)
