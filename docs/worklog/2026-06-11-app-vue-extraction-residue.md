# Worklog — App.vue extraction residue (2026-06-11)

> Audit trail for work-status item `app-vue-extraction-residue`.
> Branch `bork/fix/app-vue-extraction-residue`.
> Discharges the three residue legs PR #412's out-of-frame
> hack-rationalization gate named (FINDINGS BEYOND VERDICT 1/2/3 in
> `docs/worklog/2026-06-11-app-vue-style-and-wiring-extraction.md`).
> The `todo` DB was READ-ONLY this session; the item's closure is the
> coordinator's call on merge.

## Item summary (three legs)

1. **Coverage net** — nothing structural stops a NEW board-mutation entry
   point bypassing the grading gate; entry-point coverage was an
   enumeration. Build a deny-by-default net (measure-first, ADR-0011 Rule 3).
2. **Scoped-duplicate consolidation** — `.dark-input ×7` et al. exist as
   scoped component copies AND in the shared chrome sheet; consolidate the
   byte-equivalent ones, leave the divergent ones (ADR-0004).
3. **`useFollowMePonder` idempotence** — the call-once contract is
   comment-only; a second caller installs a second watcher. Enforce it.

## Leg 1 — grading-integrity coverage net

### Measure first (ADR-0011 Rule 3)

Enumerated every `updateBoardState` CALL site at HEAD (grep over
`src/`, call-shape `updateBoardState(`), excluding the store's own export.
**8 call sites across 5 files** (the item's "2 of 8" lead is exact):

| # | Site | Classification |
|---|------|----------------|
| 1 | `useBoardMoveRouting.ts:112` | the grading gate (free-play branch) |
| 2 | `useBoardMoveRouting.ts:163` | the grading gate (paste-PV) |
| 3 | `useReviewSession.ts:306` | the graded path itself (SGF→session board) |
| 4 | `useReviewSession.ts:373` | the graded path itself (applies graded move) |
| 5 | `useReviewSession.ts:591` | the graded path itself (engine board in review) |
| 6 | `useEngineResponder.ts:157` | engine reply move (not a user move) |
| 7 | `usePlayFromPosition.ts:831` | match cursor (engine-playback loop) |
| 8 | `loadIntoBoard.ts:62` | SGF-load primitive (dirty-guarded at callers) |

Plus the definition site `store/index.ts:530` (declares the primitive; not
a call). Each non-gate classification verified against the source (engine
responder writes the engine's own move; `usePlayFromPosition`'s
`onMoveApplied` mirrors engine moves; `loadSgfIntoBoard` replaces a board
from parsed SGF, dirty-guarded in `useDirtyBoardGuard`).

### Net shape chosen: a custom `local/*` ESLint rule

A lint fits the existing idiom better than a test: the codebase already
carries six `local/*` rules in the same family (`store-write-needs-owner`,
`hand-rolled-path-walk` — both `{file → owner/producer}` allowlists), each
deny-by-default and probe-verified at adoption (ADR-0011 Rule 4). A test
that re-derives the caller set at runtime would duplicate that machinery in
a second idiom; the lint reads the AST ESLint already parses.

`eslint-rules/board-mutation-entry-point.js` (local rule #7): a
`CallExpression` with callee `updateBoardState` in a file that is neither
the gate (`gateFiles`), the store definition (`definitionFile`), nor on the
`{fileSuffix → reason}` allowlist of non-user-move mutators is reported at
`error`. The allowlist carries the five non-gate files above, each with a
one-line reason. A NEW caller file fails until the author consciously
classifies it — route the user move through the gate, or add the file with
a reason. Deny-by-default: no silent growth of the bypass surface.

Composition note (named in the rule + config header): a new mutator that
bypasses `updateBoardState` entirely (a raw `store.boards[i] = …`) is the
`store-write-needs-owner` lint's concern (store.boards subtree → store
module). The two nets together cover the board-mutation surface; this one
guards the `updateBoardState` indirection, that one the raw slot write.

Adopted at `error` on a fully-triaged baseline — all 8 sites classified,
`npx eslint .` exit 0.

### Probe (net fires on the literal defect)

Two probes, both recorded:

- **RuleTester** (`tests/unit/eslint-rules/board-mutation-entry-point.test.ts`,
  10 cases, mirroring `clear-needs-ownership.test.ts`): the gate /
  definition / each allowlisted file PASS; an unclassified file calling
  `updateBoardState` (and a rogue component) FAIL with `ungatedEntryPoint`;
  a non-call reference PASSES. Pins the rule's own behaviour so it can't be
  edited into a silent no-op.
- **Source-tree probe**: a scratch `__probe_ungated.ts` with an unclassified
  `updateBoardState(...)` call was added to `src/composables/board/`;
  `npx eslint` on it went red with `local/board-mutation-entry-point` at
  `error`; the scratch file was removed and the tree confirmed clean.

## Leg 2 — scoped-duplicate consolidation

### Measure first: byte-equivalence audit

The item's premise — "`.dark-input ×7` et al. exist as scoped copies AND in
the shared chrome sheet; production neutrality rests on specificity alone" —
was measured rule-by-rule against `assets/css/shared-chrome.css`. The
finding REFINES the premise: the class-name collisions are real (7 scoped
`.dark-input` rules), but **only one scoped copy is byte-equivalent in
effect**. The rest are deliberate per-component overrides that differ in
value and property set — they intentionally win over the shared global
within their scope (exactly what the shared-chrome header documents:
"compose with — and, at equal property, win over — these globals").

Consolidation table (taken vs left):

| Selector | Site | Shared rule | Scoped copy | Equivalent? | Disposition |
|---|---|---|---|---|---|
| `.dark-input` | `RegistryEditor.vue:373` | 4 props, `color:--text-1` | identical 4 props | **YES** | **CONSOLIDATED** |
| `.dark-input` | HyperparamPromptModal, EngineMatchModal, MintCardModal, PlayEngineModal, HyperparameterPanel, PaletteEditor, CardSetEditor | (as above) | `color:--text-0` + monospace/padding/border-radius/width/outline (6 extra props) | NO | LEFT (divergent) |
| `.deck-selector-box` | ForestDirectory:502 | bg/padding-medium/radius/border/margin/text-align | `padding-default; border-bottom` only | NO | LEFT (divergent) |
| `.deck-dropdown` | ForestDirectory:504 | `padding-default; margin-default; color-0…` | `padding:2px 4px; margin-tight…` | NO | LEFT (divergent) |
| `.action-btn-large` | ForestDirectory:508 | `bg:accent; color:0; font-weight:bold…` | `bg:surface-2; color:accent; uppercase…` | NO | LEFT (divergent) |
| `.visits-override-row` | ReviewSessionPanel:245 | flex + space-between + bg + border + padding | `flex; gap-default; margin` only | NO | LEFT (divergent) |
| `.visits-input` | ReviewSessionPanel:247 | `width:100px; monospace; padding; outline` | `width:100%` only | NO | LEFT (divergent) |
| `.toolbar-btn-sm` | AnalysisControls:390 | `padding:1px 4px; font-size:emphasis` | `padding:2px 6px; font-size:body; uppercase` | NO | LEFT (divergent) |
| `.tab-padding` | AnalysisControls:369 | `padding:default` | `padding:0; flex-column…` | NO | LEFT (divergent) |

**Taken (1):** `RegistryEditor.vue`'s scoped `.dark-input` rule (line 373) —
byte-equivalent to the shared global (same four properties, same values,
same `--text-1`). Removed; the element falls back to the identical global
(specificity audit confirmed: the only global `.dark-input` is the
shared-chrome one; `style.css`'s `input[type="range"]` rules don't match
these text/number inputs; no equal-specificity competitor exists, so the
computed style is unchanged). A consolidation comment replaces the rule,
naming why it is absent and that the divergent copies are intentionally
left. No `--surface-1` background introduced (the global uses `--surface-0`).

**Left (8 selector-classes, 13 rules):** every divergent copy above. Per
ADR-0004 and the commission's explicit "if any copy differs in effect, leave
it" instruction, these are NOT consolidated — folding them onto the shared
sheet would CHANGE computed styles (a behaviour change the commission
forbids). They override the shared global deliberately within their scope;
the relocation arc that created the shared sheet already documented exactly
this composition.

The honest consolidation here is much smaller than the item's premise
suggested — that is the measurement's value: the "dual-declaration
fragility" the gate named is, for 12 of the 13 scoped rules, not a duplicate
at all but a deliberate scoped override. Recording the divergence is the
ADR-0004-correct outcome.

## Leg 3 — `useFollowMePonder` idempotence

Shape chosen: a **lifetime-scoped fail-loud latch** (cheaper and more honest
than the alternatives). The composable registers a single app-lifetime
watcher; a duplicate is a programming error (two watchers double-issue every
follow-me ponder query), so a second call WHILE a watcher is live throws
(ADR-0002 fail-loudly — NOT the idempotent-transition exception, because two
watchers is a genuine error, not a benign repeat).

The latch is module-scope `watcherInstalled`, set on install and cleared in
`onScopeDispose`. Binding the clear to the owning effect scope's disposal is
the load-bearing choice: a set-once boolean would wrongly reject the second
test case under `withSetup` and a real app remount. `onScopeDispose` fires
when the scope owning the `watch` disposes (the app root unmounting; a test
host tearing down), so the latch tracks the watcher's lifetime exactly.
Module-scope state in a plain `.ts` module is the sanctioned home (the
`module-intent-in-script-setup` lint targets `<script setup>`, not `.ts`).

Tests (`tests/integration/useFollowMePonder.test.ts`, +2): a second
concurrent install throws (`/already installed/`); a fresh install after the
previous scope disposes succeeds and its watcher fires. The pre-existing
three cases already implicitly prove the latch clears on teardown (each
installs and tears down; a non-clearing latch would have made the second
case throw). Probe-verified: neutering the throw (`if (false && …)`) turns
BOTH new tests red (the second because the leaked un-disposed watcher
double-fires `analyzeActiveNode`); restored, suite green.

## Verification

- `npm install` — clean (pre-existing audit advisory, unrelated;
  `node_modules` was absent in the worktree and installed this session).
- `npm run build` (`vue-tsc -b` + vite) — exit 0.
- `npx eslint .` — exit 0 (seven `local/*` rules now, the new one included;
  all 8 `updateBoardState` sites classified; no new cast surface).
- `npm run test:run` — 1014 passed / 4 skipped (was 1002 at baseline; +12 =
  10 new RuleTester cases + 2 new `useFollowMePonder` cases).
- Probe-before-trust applied per leg (Leg 1 source-tree probe; Leg 3
  throw-neuter probe), each reverted; tree clean before commit.

## Documentation checklist

- **Work-status store:** READ-ONLY this session. The item's closure is the
  coordinator's call on merge.
- **`frontend/FILES.md`:** no edit — FILES.md is scoped to `frontend/src/`;
  the two new files live in `eslint-rules/` and `tests/` (consistent with
  the six existing custom rules and all test files, none of which carry
  FILES.md rows). The three modified `src/` files
  (`useFollowMePonder.ts`, `RegistryEditor.vue`) changed neither path nor
  band; `useBoardMoveRouting.ts` was not modified (only named in the lint
  config). No row added, moved, re-banded, or removed.
- **`frontend/IDENTIFIERS.md`:** no edit — no branded identifier added,
  moved, or deleted.
- **`FEATURES.md`:** no edit — behaviour-preserving. The CSS consolidation
  is computed-style-neutral; the lint and the idempotence guard are internal
  mechanisms with no user-facing surface.
- **`frontend/eslint.config.js`:** the new rule is documented in the header
  (rationale + measured adoption baseline + named gaps) following the
  per-rule rationale discipline, and in a config-block comment.
- **`docs/handoff-current.md`:** read end to end at session start; no
  orientation surface it carries is affected.
- **ADR "Revisit when…":** none satisfied. ADR-0011 Rule 4 (quantify over
  the class) and Rule 3 (measure-first) were APPLIED, not amended.
- **Dispatch ledger:** the open dispatches under `docs/dispatch/` addressed
  to the frontend (`proxy-to-frontend-*`, `backend-to-frontend-*`) belong to
  separate arcs and were NOT read end to end; no claim about their contents
  is made here (ADR-0002 read-fully-or-say-so, the say-so branch).
- **Doc-graph:** this worklog is a new node → regenerated in the same change
  (`node tools/doc-graph/generate.mjs`); committed json+md.

## Deferrals / residue (ADR-0005 Rule 10)

- The 12 divergent scoped `.dark-input`-family rules (Leg 2 "Left" rows) are
  deliberately retained, not deferred — they are genuine per-component
  overrides, not duplicates. No follow-up is owed: consolidating them would
  change computed styles. `not-filed: intentional scoped overrides, not a
  duplicate-consolidation candidate (measured byte-divergent this session)`.
- Leg 1's lint matches the callee by NAME (`updateBoardState`); an aliased
  import or a call through an intermediate variable escapes (no such shape in
  src today). Same syntactic-best-effort posture as the sibling `local/*`
  rules; named in the rule file. `not-filed: named-callee syntactic gap,
  shared with the local/* rule family; no instance in src`.

## Deviations

None from the commission. The measurement REFINED Leg 2's premise (one
byte-equivalent copy, not seven) — surfaced loudly rather than forcing a
larger consolidation that would have changed styles (ADR-0004 / ADR-0002).
Todo DB touched read-only. No perf claims (ADR-0009; trivially
structural-by-inspection changes only). `backend/qeubo/` not read.

License: Public Domain (The Unlicense).
