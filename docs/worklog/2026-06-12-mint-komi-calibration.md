# Worklog — mint-time komi calibration (2026-06-12)

> Audit trail for work-status item `mint-komi-calibration`; branch
> `bork/feat/mint-komi-calibration`. Implements the opt-in, maintainer-
> specified, pedagogical even-game komi calibration: on mint, optionally
> re-evaluate the position and adjust the minted card's komi so the game
> is even — teaching the student the correct move set as if the position
> were balanced.

## Background

A minted flashcard stores its position as an SGF string in
`CardCreatePayload.raw_content`. Komi travels in that SGF's root-node
`KM` property — there is **no separate komi wire field** on the
card-create contract. So adjusting a minted card's komi is fully
frontend-expressible: it is a rewrite of the `KM` value in the
already-serialized `raw_content`. No backend dispatch was needed (the
hard-constraint check for "cannot be expressed frontend-only" did not
fire).

## Where komi travels (the mint flow)

- `MintCardModal.open(boardId)` → `useMinting.prepareDraft(boardId)`
  builds the `CardCreatePayload`.
- `prepareDraft` serializes the active path (root→current) to SGF via
  `serializeActivePath(board)` (`engine/sgf-writer.ts`) and stores it in
  `draft.raw_content`. The root node's `KM` property (read elsewhere via
  `getKomi`, `engine/util.ts`) rides inside that string.
- `MintCardModal.submit()` → `useMinting.commitMint(draft)` →
  `backendService.createCard(payload)` PUTs `raw_content` as-is.

The injection point for the calibrated komi is therefore the draft's
`raw_content` at submit time (after the user has opted in and the
evaluation has resolved) — done by `setSgfRootKomi`, a new pure rewrite.

## The komi arithmetic (direction evidence)

The load-bearing decision is the sign framing. Evidence consulted in the
codebase before implementing:

- `src/engine/katago/types.ts` (the `reportAnalysisWinratesAs` doc):
  `'WHITE'` → `+scoreLead = White favoured`; `'BLACK'` →
  `+scoreLead = Black favoured`; `'SIDETOMOVE'` → positive favours the
  side to move (flips per packet's `currentPlayer`).
- `src/engine/katago/winrate-framing.ts`:
  `normalizePacketToWhiteFraming` negates `scoreLead` to canonicalise
  BLACK→WHITE and SIDETOMOVE→WHITE (negate iff `currentPlayer === 'B'`),
  confirming the sign rules.

The arithmetic works in **Black-positive** points:
`scoreLeadToBlackPositive` reuses `resolveWinrateFraming` (not a parallel
hand-rolled resolver) and applies the single extra WHITE→Black negation.

Direction: komi compensates White (SGF `KM` and KataGo's `komi` field
both *add* to White's score; `+komi` favours White). If Black is ahead
by L points (`scoreLeadBlackPositive = +L`) under komi K, White needs L
more points of compensation to make the game even, so:

```
evenKomi = evalKomi + scoreLeadBlackPositive
```

Black ahead ⇒ raise komi. This matches the task brief's specified
direction; no inverted-direction evidence was found, so no STOP-and-
report was warranted. Verified by the unit tests (WHITE/BLACK/SIDETOMOVE
worked cases in `komi-calibration.test.ts`).

KataGo accepts only integer/half-integer komi in [-150, 150]: the sum is
rounded to the nearest 0.5 (`Math.round(x*2)/2`, half-up on ties) and
clamped, with a `clamped` flag surfaced so the user is told when the
computed komi was out of range (ADR-0002 — no silent endpoint
substitution).

`evalKomi` is **single-source**: read once from the board (`getKomi`),
placed on the query payload the engine sees, and reported back to the
arithmetic — the wire and the math agree by construction.

## Files

New source:

- `frontend/src/engine/katago/komi-calibration.ts` ([B3]) — the pure
  arithmetic (`computeEvenKomi`, `scoreLeadToBlackPositive`,
  `roundToHalf`, `clampKomi`). Imports only `winrate-framing` + `types`.
- `frontend/src/engine/katago/fresh-eval.ts` ([B3]) — the SHARED
  one-shot-eval primitives `connectFresh` + `awaitFinalPacket`, extracted
  per the out-of-frame audit (see Appendix A). `usePlayFromPosition`
  (engine self-play / match) and `useKomiCalibration` are the consumers;
  the queue-tooltip telemetry side-effects are injected via optional
  `AwaitFinalPacketHooks` so the [B3] engine module stays free of the
  `useQueryTelemetry` composable.
- `frontend/src/composables/review/useKomiCalibration.ts` ([B3]) — the
  effect-orchestration: a one-shot `connectFresh → subscribe → await
  authoritative final packet → disconnect` (the SHARED `fresh-eval.ts`
  primitives), then `computeEvenKomi`. Fails loudly on every failure mode
  (connect-before-open, wire error packet, timeout) — no silent
  uncalibrated fallback. (The initial draft copied the primitives; the
  audit in Appendix A found that an UNDISCHARGED-HACK and they were
  extracted.)

Changed source:

- `frontend/src/engine/sgf-writer.ts` ([B3]) — new pure `setSgfRootKomi`
  (replace-in-place or insert-at-head of the bracket-aware root block;
  throws on malformed SGF).
- `frontend/src/composables/review/useMinting.ts` — new
  `calibrateKomiOnDraft(boardId, draft, visits)` orchestration: runs the
  calibration, rewrites `draft.raw_content`'s komi, returns the result
  for the modal to log. Keeps the logic in the composable layer (the
  modal stays a thin renderer).
- `frontend/src/components/modals/MintCardModal.vue` ([B3]) — the
  checkbox + visits input, gated on `store.engine.status === 'connected'`
  (the `engineConnected` predicate, same as the keybindings catalog's).
  Strictly opt-in (unchecked default); the visits input prefills from the
  setting and does NOT write back. `submit()` runs calibration before
  commit when enabled, system-logs the komi set (info; names the clamp),
  and aborts loudly (no commit; error logged) on failure.
- `frontend/src/composables/board/usePlayFromPosition.ts` — rewired to the
  shared `fresh-eval.ts` `connectFresh` / `awaitFinalPacket`; its local
  byte-identical copies removed. The queue-tooltip telemetry
  (register / record / cancel-terminate / unregister) is preserved as a
  thin wrapper that drives the shared primitive's hooks. Behaviour-
  preserving (full suite green, incl. the cursor-independence and e2e
  harness tests that exercise the telemetry path).
- `frontend/src/store/schema.ts` + `frontend/src/store/defaults.ts` — new
  `engine.katago.calibrationVisits: number` (default 1000), distinct from
  `minting.defaultVisits` (the per-card *analysis* budget; this is the
  one-shot mint-time *evaluation* budget, never persisted onto the card).
  Surfaces in the RegistryEditor via DEFAULTS like its `engine.katago.*`
  siblings (not hand-wired).
- Migration **60 → 61** (`frontend/src/store/migrations.ts`) backfills
  `calibrationVisits = 1000` through the witnessed
  `profile.settings.engine.katago` container; `CURRENT_SCHEMA_VERSION`
  bumped 60 → 61. Per the rolling-archive cadence, **58 → 59 moved into
  `archived-migrations.ts`** (verbatim cut-and-paste, byte-frozen) in the
  same change; the active file keeps the latest two (59 → 60, 60 → 61).

Tests:

- `frontend/tests/unit/engine/katago/komi-calibration.test.ts` — pure
  arithmetic: framing variants, rounding ties (x.25 / x.75 / negatives),
  clamping at both ends, the no-flag-when-exactly-on-endpoint case.
- `frontend/tests/unit/engine/sgf-writer-komi.test.ts` — `setSgfRootKomi`
  replace / insert / malformed-throw + a `serializeActivePath`
  round-trip on a real board.
- `frontend/tests/integration/MintCardModal-komi-calibration.test.ts` —
  the mint flow with `useMinting` mocked: calibrated mint adjusts komi +
  logs info then commits; eval failure aborts loudly (no commit, error
  logged); opt-out mint unchanged; controls hidden when no engine.
- `frontend/tests/unit/store/migrations.test.ts` — new `60 → 61`
  describe block (backfill / idempotence / wrong-type / partial-blob /
  end-to-end).

Docs:

- `FEATURES.md` — new `Calibrate komi` `[experimental]` bullet under Card
  minting.
- `frontend/FILES.md` — rows for `komi-calibration.ts` and
  `useKomiCalibration.ts`; `useMinting.ts` row note updated.
- Doc-graph regenerated (this worklog is a structural add).

## i18n

Six new keys added to `en.json` (source) and mirrored into the three
stub catalogs (`ja`, `ko`, `zh-CN`). Standard JSON has no comments;
machine-drafted translations are flagged here as `[unreviewed
translation]`, key by key (native-speaker review is the remaining gate
per the i18n plan's lockstep posture, the same convention the
2026-06-11 learned-VF worklog used):

- `mint.field.calibrateKomi`
  - ja: `コミを調整:` [unreviewed translation]
  - ko: `덤 보정:` [unreviewed translation]
  - zh-CN: `校准贴目:` [unreviewed translation]
- `mint.field.calibrationVisits`
  - ja: `調整用訪問数:` [unreviewed translation]
  - ko: `보정 방문 횟수:` [unreviewed translation]
  - zh-CN: `校准访问数:` [unreviewed translation]
- `mint.komiCalibration.hint`
  - ja: `この局面を再評価し、互角になるようコミを設定します。` [unreviewed translation]
  - ko: `이 국면을 재평가하여 호각이 되도록 덤을 설정합니다.` [unreviewed translation]
  - zh-CN: `重新评估此局面并设定贴目使对局均衡。` [unreviewed translation]
- `mint.komiCalibration.set`
  - ja: `コミを調整しました: このカードに {komi} を設定しました。` [unreviewed translation]
  - ko: `덤 보정 완료: 이 카드에 {komi}(으)로 설정했습니다.` [unreviewed translation]
  - zh-CN: `贴目已校准：本卡片设为 {komi}。` [unreviewed translation]
- `mint.komiCalibration.setClamped`
  - ja: `コミを調整しました: 計算値 {raw} を {komi} に制限しました（KataGo のコミ範囲）。` [unreviewed translation]
  - ko: `덤 보정 완료: 계산값 {raw}을(를) {komi}(으)로 제한했습니다 (KataGo 덤 범위).` [unreviewed translation]
  - zh-CN: `贴目已校准：计算值 {raw}，限制为 {komi}（KataGo 贴目范围）。` [unreviewed translation]
- `mint.komiCalibration.failed`
  - ja: `コミの調整に失敗しました。作成を中止しました: {err}` [unreviewed translation]
  - ko: `덤 보정 실패; 만들기를 중단했습니다: {err}` [unreviewed translation]
  - zh-CN: `贴目校准失败，已取消制作：{err}` [unreviewed translation]

## Verification

- `vue-tsc -b` — clean.
- `npm run build` (`vue-tsc -b && vite build`) — clean.
- `npm run test:run` (full suite) — **78 files passed / 3 skipped;
  1088 tests passed / 4 skipped / 0 failed** (was 78/1064 before this
  arc's +24 tests; the migration-store-roundtrip key-set invariant still
  holds — the 60 → 61 backfill produces `calibrationVisits` on the
  corpus's katago container, so it is NOT a new defaults-only path).
- `eslint .` — clean on all tracked source touched by this arc. (The
  worktree carries pre-existing untracked `.vue.js` / stale compiled
  `.js` cache artefacts that ESLint flags for missing local rule
  definitions; they are absent from the main checkout, untracked by git,
  and do not reach CI's clean-checkout run — same artefact class the
  2026-06-12 engine-move-delta-reconcile worklog records.)
- `node tools/band-conformance/check.mjs --check` — 30 advisory findings
  against baseline 30 (2026-06-12). No new band leaks. The two new
  files + the `sgf-writer.ts` addition are correctly [B3]. Pass.
- `node tools/doc-graph/generate.mjs` — regenerated; doc-graph.json
  updated (structural add: this worklog node).

## Decisions under ambiguity

1. **New setting separate from `minting.defaultVisits`.** The brief
   pointed at `engine.katago.*` scalars as the pattern, and the existing
   `minting.defaultVisits` is the per-card *analysis* budget the backend
   records. Calibration is a one-shot *evaluation* budget spent at mint
   time and never persisted. Keeping them distinct (new
   `engine.katago.calibrationVisits`) avoids overloading one field with
   two meanings (ADR-0008 — honest classification). The brief explicitly
   directed studying `engine.katago.*` declarations; this lands there.

2. **`[unreviewed translation]` convention.** The brief said to mirror
   keys "following the existing `[unreviewed translation]` convention",
   but no such marker exists *in* the catalogs (standard JSON has no
   comments). `frontend/docs/i18n.md` and the 2026-06-11 learned-VF
   worklog establish that the flag lives in the worklog, key by key,
   with machine-drafted values in the stub catalogs. Followed that lived
   convention (above).

3. **SGF komi injection as a string rewrite, not a re-serialize.** The
   draft already holds the exact serialized SGF; `serializeActivePath`
   produces a ROOT→CURRENT-truncated string (the minted card depends on
   that truncation), and there is no board lying around that re-serializes
   to it except by replaying the same truncation. So re-deriving a board,
   setting komi on it, and re-serializing would have to reproduce that
   truncation or drift. `setSgfRootKomi` rewrites the one carrier (`KM`)
   in place — drift-free, and it never touches the live board. The audit
   (Appendix A) accepted this as **narrower-but-justified** and noted a
   residual two-representation hazard (board-komi vs. SGF-string komi are
   authored through different representations with nothing asserting they
   agree); the insert-branch handles the no-`KM` board case and is tested,
   so the path is covered — the hazard is structural, recorded below.

4. **Shared `connectFresh`/`awaitFinalPacket` via `fresh-eval.ts`.**
   *(Revised after the out-of-frame audit — see Appendix A. The initial
   draft copied the primitives into `useKomiCalibration` and justified it
   as "minimal-touch / no second adopter yet"; the audit found that an
   UNDISCHARGED-HACK: `connectFresh` was byte-identical, and
   `usePlayFromPosition` already shared these primitives across
   `playEngineMoves` / `playEngineMatch`, so calibration was the THIRD
   consumer — past ADR-0003's extract-on-second-consumer trigger, not
   short of it.)* Resolution: extracted `connectFresh` + `awaitFinalPacket`
   into `engine/katago/fresh-eval.ts` ([B3]) as the single owned copy;
   both `usePlayFromPosition` and `useKomiCalibration` consume it. The
   one genuine difference between the two old copies — the match loop's
   queue-tooltip telemetry — is preserved as injectable
   `AwaitFinalPacketHooks` (`onPacket` / `onSettle` / `armCancel`) so the
   engine module stays free of the `useQueryTelemetry` composable. The
   invariant the fix establishes, quantifying over all consumers: *one
   owned `connect → await-final-packet → disconnect` primitive set; per-
   caller side-effects ride on hooks.*

## Deferrals / residue

- **Two-representation komi hazard (recorded, not filed).** The minted
  card's komi is now authored through two representations: the board's
  `nodes[root].properties['KM']` array (`App.vue::handleUpdateKomi`) and a
  regex over the serialized SGF string (`setSgfRootKomi`). Nothing asserts
  the draft's serialized `KM` round-trips to what `getKomi` would parse.
  The current paths are covered (insert-branch handles a board with no
  `KM`; a test pins it), so this is a structural sharp edge, not a live
  bug. A future hardening would route calibration through the one
  serializer seam rather than a second string-level author. `not-filed:`
  marker — surfaced for the coordinator to file or decline; not blocking.
- **`setSgfRootKomi` public-surface guard (recorded, not filed).** The
  helper assumes its input came from `serializeActivePath` (its
  "first root `KM` is THE komi" assumption holds only for this writer's
  output). It is exported and general-looking; a future caller passing
  arbitrary SGF is outside the regex's safety envelope. Not a defect now
  (the sole caller is the trusted draft path). `not-filed:` marker.

The `[unreviewed translation]` stub translations are the standing i18n
follow-up (native-speaker review), tracked by the same lockstep posture
as every other stub key — not a code residue of this arc.

## Cross-references

- `frontend/src/engine/katago/komi-calibration.ts` — the pure arithmetic.
- `frontend/src/composables/review/useKomiCalibration.ts` — the
  evaluation orchestration.
- `frontend/src/composables/review/useMinting.ts` — the
  `calibrateKomiOnDraft` mint-flow integration.
- `frontend/src/engine/sgf-writer.ts` — `setSgfRootKomi`.
- `frontend/src/store/migrations.ts` /
  `frontend/src/store/archived-migrations.ts` — the 60 → 61 migration and
  the 58 → 59 rolling-archive move.
- `frontend/src/engine/katago/fresh-eval.ts` — the shared one-shot-eval
  primitives extracted per Appendix A.

## Appendix A — out-of-frame hack-rationalization audit (verbatim)

The `hack-rationalization-detector` skill was run OUT OF FRAME (a
separate `general-purpose` subagent that did not write the change and
treated the implementer's framing as the object of suspicion). The
commission named four points to scrutinize: (1) the multi-writer komi
slot / string-rewrite, (2) the copied `connectFresh`/`awaitFinalPacket`,
(3) the single-source `evalKomi` claim, (4) the framing direction. The
auditor's full artifact is reproduced verbatim below (per the skill's
verbatim-return rule and the consult-appendix discipline). It returned
**narrower-but-justified** on (1), **UNDISCHARGED-HACK** on (2), and
**sound** on (3)+(4). Point (2) was discharged in this same change by
extracting `fresh-eval.ts` (Decision 4, revised). The point-(1) residual
fragility and the `setSgfRootKomi` public-surface edge are recorded under
Deferrals as `not-filed:` markers.

> ## Hack-rationalization review: mint-komi-calibration (staged, worktree agent-abefb77005b04df87)
>
> FRAME CHECK: Out of frame. I did not write this change and treated the implementer's worklog + the four flagged points as the OBJECT OF SUSPICION, not as context to agree with. Frame holds; proceeding.
>
> GENERAL FIX:   Two distinct invariants are in play, and they should be judged separately. (1) Card-komi-at-mint: "the minted card's komi is the board's komi, produced by serializing the board once — calibration adjusts the BOARD's komi (one existing owned writer) and lets serialization carry it," NOT "rewrite the already-serialized string after the fact." (2) Fresh-eval connection: "one owned `connect → await-final-packet → disconnect` primitive set, used by every one-shot evaluator," NOT "each evaluator carries its own copy."
>
> PATCH SHIPPED: (1) A new `setSgfRootKomi` that string-rewrites the `KM[...]` token in the draft's already-serialized `raw_content` in place. (2) `useKomiCalibration.ts` carries its own `connectFresh` (byte-identical to usePlayFromPosition's) + `awaitFinalPacket` (near-identical) + `buildCalibrationQuery` (near-identical to `buildAnalyzeQuery`).
>
> DOWNGRADE:     (1) "minimal, drift-free … re-deriving the board and re-serializing would risk drifting from it" — a stated cost, examined below. (2) "minimal-touch / the privates are shaped for next-move not position / no second adopter yet (ADR-0003)" — discipline-words; the cost claim is examined below and does not survive.
>
> WRITER DELTA:  Claimed 4 writers of the card/board komi (KM): (a) setSgfRootKomi on draft, (b) App.vue::handleUpdateKomi on live board, (c) SGF loader from file, (d) serializeActivePath reads board KM into mint SGF.
> Independently enumerated — writers of the SGF `KM` root property / board komi:
>   • App.vue:175  `root.properties['KM'] = [newKomi.toString()]` (live board, via handleUpdateKomi ← StatusBar `update-komi` emit) — REAL WRITER.
>   • engine/sgf-writer.ts:96 `setSgfRootKomi` (NEW; draft string) — REAL WRITER.
>   • The SGF loader path is a READER into BoardState, not a `KM`-string writer: `getKomi` (engine/util.ts:167) reads `properties['KM']`; useMetadata.ts:28 reads `props['KM']` into a display komi. The loader populates BoardState from the parsed SGF; it does not independently re-author `KM`. So claimed writer (c) is really the read boundary, and (d) `serializeActivePath` is a serializer (writer to the SGF string FROM the board's nodes), not an independent komi author.
> Net: the genuinely independent KOMI AUTHORS are TWO — handleUpdateKomi (board) and setSgfRootKomi (draft string). They write the same logical slot through two DIFFERENT representations (the board's `nodes[root].properties['KM']` array vs. a regex over the serialized string). This is the multi-writer split the implementer flagged, and it is real: the new writer does NOT go through the one pre-existing board-komi mutator. (No additional missed third writer found — the enumeration matches the implementer's count once (c)/(d) are correctly reclassified as reader/serializer.)
>
> RUNTIME:       Unverified against live software. The worklog reports `vue-tsc`, build, and a full `npm run test:run` pass (1088 passed), and the integration test mocks `useMinting`. No live-engine repro of an actual calibrated mint is claimed (the mint→fresh-eval→KM-rewrite→commit round trip against a real proxy). Per the skill's Step 4 and the umbrella's "ask for runtime visibility on the non-local side" rule, the engine-facing leg is paper-verified only. The arithmetic direction (point #4) I re-derived by hand and it is CORRECT (see below); that is the one load-bearing correctness question that did not need a runtime to settle.
>
> TELLS (Step 1):
>   grep_tells over the worklog: 0 co-occurrence tells (5 minimality terms, 1 cue — the downgrade was narrated cleanly enough to dodge the 220-char window; absence is not absolution, per the scanner's own note).
>   grep_tells over the implementer's own four-point commission prose: 2 tells, both on the same sentence —
>     [1] 'minimal' ~near~ 'invariant'
>     [2] 'minimal-touch' ~near~ 'invariant'
>     "…Is there a more-general single owner for the card's komi at mint INVARIANT I downgraded? useKomiCalibration COPIES connectFresh/awaitFinalPacket … I justified this as MINIMAL-TOUCH …"
>     This is the textbook signature: a more-general invariant ("single owner for the card's komi at mint") named in the same breath as the discipline-word used to set it aside. The implementer flagged it themselves, which is to their credit, but flagging is not discharging.
>
> VERDICT: narrower-but-justified on point (1); UNDISCHARGED-HACK on point (2).
>
> WHY (point 1 — the KM string rewrite, narrower-but-justified):
>   The DOWNGRADE line here names a CONCRETE cost, not a mood: `serializeActivePath` serializes ROOT→CURRENT (the path up to the cursor), and its header documents that the minted card depends on exactly that truncated shape. The draft's `raw_content` is the authoritative already-serialized artifact; re-deriving a board, setting komi on it, and re-serializing would have to reproduce that exact root→current truncation or it would drift. So "set komi on a board and re-serialize" is not actually the cheaper general fix in this flow — there is no board lying around that serializes to the draft string except by replaying the same path-truncation. Given that, a surgical single-property rewrite of the one carrier (`KM`) is a defensible localized injection. Two real residual risks below, but the string-rewrite choice itself is justified, not laundered.
>
> WHY (point 2 — the copied connect/await primitives, UNDISCHARGED-HACK):
>   The cost cited for NOT sharing is "the privates are shaped for next-move not position / no second adopter yet." Both legs fail on inspection. (i) `connectFresh` is BYTE-IDENTICAL between usePlayFromPosition.ts and useKomiCalibration.ts (verified by diff — zero differences); it contains nothing "shaped for next-move" — it is a pure URL→client connector. The "shaped for next-move" justification is true of `buildAnalyzeQuery` (which reads `moveInfos[0]`), but it was applied as cover to `connectFresh`, which has no such shaping. (ii) "No second adopter yet (ADR-0003)" is factually wrong: usePlayFromPosition.ts ALREADY has TWO consumers of these primitives in-file — `playEngineMoves` AND `playEngineMatch` both call `connectFresh` + `awaitFinalPacket` + `buildAnalyzeQuery`, and the file's own docstrings call them "siblings [that] share helpers." `useKomiCalibration` is the THIRD adopter of the connection shape and at least the third copy of `connectFresh`. ADR-0003's "extract on the second concrete consumer" trigger was passed before this change was authored; this change is the second-or-third consumer, which is precisely when the ADR says to extract, not defer. The named-better-fix ("one owned fresh-eval connection primitive set") was set aside on a discipline-word and a false adopter-count. That is the documented Case-A shape: a copy made one-producer-at-a-time where a single shared primitive quantifies over all of them.
>
> FINDINGS BEYOND VERDICT (required):
>   - Direction (#4) is CORRECT, not inverted. Worked example under WHITE framing (registry default): Black genuinely ahead 10 pts at evalKomi 6.5 ⇒ KataGo reports scoreLead −10 ⇒ scoreLeadToBlackPositive(−10,WHITE) = +10 ⇒ rawEvenKomi = 6.5+10 = 16.5. Komi rises; since komi adds to White, +10 more komi neutralizes Black's 10-pt lead. Even. The reuse of `resolveWinrateFraming` (not a parallel hand-rolled resolver) is genuine and matches `normalizePacketToWhiteFraming`'s sign rules in the opposite (BLACK) target perspective. This leg is sound.
>   - Single-source evalKomi (#3) holds. `getKomi(board)` is read exactly once in buildCalibrationQuery (useKomiCalibration.ts:165), placed on the query's `komi` field AND returned as `evalKomi`; computeEvenKomi consumes that same scalar. No second divergent read. Sound.
>   - Two-representation hazard (the load-bearing residual on point 1). The two komi authors write through INCOMPATIBLE representations: handleUpdateKomi writes a structured array on the board's root node; setSgfRootKomi regex-matches `KM[...]` on a serialized string. `serializeActivePath` only emits `KM` if the root node's `properties['KM']` is present — `getKomi` DEFAULTS to 6.5 when absent but does NOT write it back, so a board that never had its komi explicitly set serializes to an SGF with NO `KM` token. setSgfRootKomi's insert-branch handles that (it inserts `KM[...]` at the root-block head), and a test covers insert — so the immediate path is covered. The fragility is structural, not a live bug: the card's komi is now authored in two places that cannot validate each other, and nothing asserts the draft's serialized `KM` equals what `getKomi` would parse back. The minimal hardening that would make point (1) fully general: have calibration set komi on the board's representation (or a board-shaped value) and let the ONE serializer carry it, so there is a single komi-authoring representation rather than a string-level second one. The implementer asked whether there is "a single owned komi-injection seam I downgraded" — yes: `serializeActivePath` is that seam, and the change writes around it at the string level instead of through it.
>   - setSgfRootKomi correctness corner: its "first KM[...] on the root block is THE komi" assumption holds ONLY for SGF this writer emits. It operates on `draft.raw_content`, which always comes from `serializeActivePath` in this flow, so the assumption is locally safe today. But `setSgfRootKomi` is now an exported, general-looking helper (enumerate_writers found it as a standalone export) with no guard that its input came from the trusted serializer — a future caller passing arbitrary SGF (e.g. a root block whose first `KM` sits inside a different node, or pathological whitespace before the first `;`) is outside the regex's safety envelope. Not a defect now; a sharp edge on a public-shaped surface.
>   - awaitFinalPacket divergence is real but minor: the calibration copy drops the telemetry registration leg the usePlayFromPosition copy carries. That is a genuine behavioural difference (calibration queries won't appear in the Toolbar queue tooltip) — arguably correct (a one-shot mint eval need not surface in the live queue), but it means the "copy" is now a THIRD maintenance point that has already started to drift from its siblings on day one. Drift-on-arrival is the exact cost ADR-0003 extraction-on-2nd-adopter exists to prevent, and it is already visible here.
>   - Doc/test hygiene is otherwise clean: FILES.md rows added, FEATURES.md `[experimental]` tag honest, migration rolling-archive (58→59) performed per discipline, doc-graph regenerated. None of these touch the two findings above.

**Disposition of each finding (gate-discharge triage):**

- Point (2) UNDISCHARGED-HACK + the awaitFinalPacket-drift finding —
  **APPLIED.** `fresh-eval.ts` extracted; both consumers rewired; the
  telemetry-vs-no-telemetry divergence is now the explicit hook seam, not
  a silent drift.
- Two-representation hazard (point 1 residual) — **FILED as `not-filed:`**
  (Deferrals). Structural, not a live bug; the covered path has a test.
- `setSgfRootKomi` public-surface guard — **FILED as `not-filed:`**
  (Deferrals).
- RUNTIME unverified — **ACKNOWLEDGED, not dischargeable here.** Driving
  the live proxy is explicitly out of scope for this commission (the
  maintainer validates against a live engine; the feature ships
  `[experimental]` for that reason). The engine-facing leg is exercised
  through fakes; the arithmetic and SGF-rewrite legs are unit-tested.
- Direction (#4) + single-source evalKomi (#3) — **SOUND, no action.**

License: Public Domain (The Unlicense).
