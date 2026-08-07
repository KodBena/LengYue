# swz-setup-wizard fresh-context review

**Reviewer branch/worktree:** `worktree-agent-ab02ce847b9a107fa`
(`/home/bork/w/omega/.claude/worktrees/agent-ab02ce847b9a107fa`).
Artifact commits `6f3e4b1f` + `b5c2c4a6` inspected via a local branch
`review-swz-local` created in this worktree at `b5c2c4a6` (the
original branch name `worktree-agent-ad285a38fca6e3d97` was already
checked out in its own worktree, so it could not be checked out here
too; `review-swz-local` points at the identical commit).

Posture: REFUTE. Findings below are formed from my own reading of the
diff, my own gate runs, and my own red/green witness, before reading
the builder's self-report (`swz-setup-wizard-build.md`, read last —
see "Self-report cross-check" at the end).

## Verdict: **MERGE-WITH-FIXES**

One BLOCKER (theme neutrality is broken in practice, not just a merge
artifact — needs a design decision, not a mechanical compose step),
plus the two known merge seams need concrete compose steps below. The
delivery is otherwise solid: clean architecture (ADR-0012 one-fact-one-
home is genuinely followed for every control), clean tests, clean
gates, files well under ADR-0007 size limits, FILES.md rows present.

---

## BLOCKER

### B1 — Theme step is not neutral in practice; the fresh-profile default pre-selects "Light"

Ledger row 725's ruling requires neither theme option to carry a
preselected favorite. The wizard code's *mechanism* looks right in
isolation — `WizardStepTheme.vue` derives `is-selected` purely from
`store.profile.settings.appearance.theme`, never a component-local
"recommended" flag — but that live cell is **not neutral on a fresh
profile**:

- `frontend/src/store/schema.ts`: `theme: 'dark' | 'cluster'` — a
  non-nullable, two-value union. There is no "unset" representable
  state.
- `frontend/src/store/defaults.ts:317`: `theme: 'cluster'` is the
  literal default inside `defaultSettings` (typed `AppSettings`,
  cast at `defaults.ts:634` — `settings: defaultSettings as unknown
  as AppSettings` — and wired to `profile: defaultProfile` at
  `defaults.ts:766`/`store/index.ts:141`). Every fresh profile
  therefore starts with `appearance.theme === 'cluster'` **before the
  wizard ever mounts**.
- `frontend/src/locales/en.json:657`: `wizard.theme.cluster` is
  labelled `"Light"` to the user.
- `frontend/src/components/wizard/steps/WizardStepTheme.vue:23,41`:
  `activeTheme = computed(() => store.profile.settings.appearance.theme)`
  and `:class="{ 'is-selected': activeTheme === theme }"`.

Net effect: on every genuinely fresh profile, the "Light" card
renders with `is-selected` (accent border) the instant the wizard
opens, before the user has clicked anything — the exact "preselected
favorite" the commissioner's ruling forbids. The component's own copy
(`wizard.step.theme.description`: *"there's no default we recommend"*)
and `FILES.md`'s row for this file (*"no preselected favorite"*) both
assert a neutrality the running code does not deliver. The builder's
self-report makes the same overclaim (*"selection state derived purely
from the live cell ... satisfies the commissioner's no-preselected-
favorite ruling"*) — deriving from the live cell is only neutral if
the live cell itself starts neutral, and it doesn't.

This is not one of the two known merge seams and is not a simple
compose step — `appearance.theme` is a pre-existing, non-wizard cell
whose default predates this feature and which `RegistryEditor.vue`
also depends on being non-null elsewhere. Flagging as a BLOCKER
because it's a direct violation of an explicit ratified requirement,
but the fix is a product/design call, not mine to make silently:
options include (a) give `WizardStepTheme.vue` component-local
"nothing chosen yet" UI state that only writes through to the store
on click (never reflecting the pre-existing default as "selected"
until the user acts), or (b) a maintainer ruling that the existing
`'cluster'` default is acceptable to keep and the neutrality
requirement is satisfied at the "no card is *recommended*/visually
emphasized beyond selection state" level rather than "no card
reflects any prior value." Either is a legitimate call; shipping
silently on the current code is not, since it contradicts the
ruling's own wording ("neither card carries an active/highlighted
state until the user clicks one").

---

## Seam 1 — toolbar-engine-uri cherry-pick (pre-review) vs. next's reviewed/composed fixes

Diffed the branch's copies against the real `next` HEAD directly
(`git diff next -- <file>`, run from this worktree after creating
`review-swz-local` at `b5c2c4a6`).

**REQUIRED — `frontend/src/components/chrome/ToolbarEngineUri.vue`,
`onEscape()`:** the branch's copy still calls `inputEl.value?.blur();`
after `cancel()`. `next` removed that explicit blur (with a comment
explaining why — DOM removal of a focused node doesn't fire `blur`,
so the explicit call was firing `@blur="commit"` on the
still-mounted input and turning Escape/Cancel into a commit with an
unvalidated value, review BLOCKER `toolbar-engine-uri-review.md`
finding 1). **Compose step: take `next`'s `onEscape()` body verbatim
(the bare `cancel();`, no blur call).**

**REQUIRED — `frontend/src/composables/useEngineUriEditor.ts`,
`commit()`:** the branch's copy is missing the guard `next` added:
```ts
function commit(): void {
  if (!isEditing.value) return;   // <- present on next, absent on the branch
  const validation = validateEngineUri(draft.value);
  ...
```
Without it, a commit path racing a cancel (the same class of bug
finding 1 above names) can still fire after the editor closed.
**Compose step: reinstate the `if (!isEditing.value) return;` guard
as the first line of `commit()`, taken from `next`.**

**REQUIRED (doc-only) — `frontend/src/lib/ws-url.ts` header +
`frontend/FILES.md`'s `useEngineUriEditor.ts` row:** `next` corrected
both to say the validation is now the single check *both* editors
(toolbar and Settings' Advanced Registry) apply; the branch's copies
still carry the stale "Settings writes the same cell separately,
unvalidated" wording. **Compose step: take `next`'s wording for both.**

These three are the only diffs between the branch's cherry-picked
`ToolbarEngineUri.vue`/`useEngineUriEditor.ts`/`ws-url.ts` and `next`'s
copies — confirmed by full `git diff next -- <file>` for each of the
three files (no other divergence).

---

## Seam 2 — demo asset replacement (Go Seigen/Fujisawa → synthetic self-play)

`next` commit `0719dbdd` (already merged, on top of `c4be39d9` which
the wizard branch is otherwise built on) replaced
`frontend/src/assets/setup-wizard-demo.json` for copyright reasons.
**The shape is not actually identical** despite the commit message's
"same asset path/shape" claim — I diffed both JSON files directly:

| | old (`c4be39d9`, what the wizard branch was built against) | new (`next`, committed) |
|---|---|---|
| top-level keys | `provenance`, `moves` (117 entries, the full replayed game), `analysis` | `provenance`, `fullGameMoves` (110), `moves` (95, truncated to the selected turn), `analysis` |
| `provenance` fields | `gameRawId`, `black`, `white`, `date`, `result`, `position`, `rules`, `komi`, `model`, `maxVisits`, `proxyVersion`, `capturedAt` | `origin`, `model`, `selfPlayVisitsPerMove`, `analysisVisits`, `rules`, `komi`, `selection`, `selectedTurn`, `entropyBits`, `capturedAt` |

None of `black`/`white`/`date`/`result`/`position`/`gameRawId`/
`maxVisits` survive into the new `provenance` object. This is a real
break, not cosmetic — confirmed two ways:

**1. Silent UI breakage (no throw — `assertShape` only checks
`provenance` is *some* object, never its individual fields):**
`frontend/src/components/wizard/steps/WizardStepDemoBoard.vue:76-79`
interpolates `provenance.black`, `.white`, `.date`, `.position` into
`wizard.demoBoard.provenance` (`en.json:670`: `"{black} (B) vs
{white} (W), {date} — move {position}"`). Against the real committed
`next` asset this renders literally `"undefined (B) vs undefined (W),
undefined — move undefined"`.

**2. Load-bearing test regression — witnessed red, then green:**
```
$ cp frontend/src/assets/setup-wizard-demo.json /tmp/.../branch-asset-backup.json
$ git show next:frontend/src/assets/setup-wizard-demo.json > frontend/src/assets/setup-wizard-demo.json
$ npx vitest run tests/unit/lib/setup-wizard-demo-loader.test.ts
```
```
 ❯ tests/unit/lib/setup-wizard-demo-loader.test.ts (14 tests | 1 failed)
     × loads and replays the real asset to a real BoardState
AssertionError: expected undefined to be 'Go Seigen'
 ❯ tests/unit/lib/setup-wizard-demo-loader.test.ts:48:35
     48|     expect(demo.provenance.black).toBe('Go Seigen');
 Test Files  1 failed (1)
      Tests  1 failed | 13 passed (14)
```
— **RED**, exactly as predicted from the shape diff. Then:
```
$ cp /tmp/.../branch-asset-backup.json frontend/src/assets/setup-wizard-demo.json
$ npx vitest run tests/unit/lib/setup-wizard-demo-loader.test.ts
 Test Files  1 passed (1)
      Tests  14 passed (14)
```
— **GREEN** after restoring the branch's own (pre-merge) asset. Working
tree is clean again (`git status --short` shows no diff in
`frontend/src/assets/`).

**Merge scrub steps (all under `frontend/`, all naming Go Seigen /
Fujisawa / 1971 / the old position or provenance fields):**

1. `src/components/wizard/steps/WizardStepDemoBoard.vue:76-79` — the
   `wizard.demoBoard.provenance` interpolation must be rebuilt against
   the real field set (`origin`/`selection`/`selectedTurn`/
   `entropyBits`/`model`/`capturedAt` — no `black`/`white`/`date`/
   `position` equivalent exists for a self-play position; needs new
   copy, not a field rename).
2. `src/locales/en.json:670` — `wizard.demoBoard.provenance` template
   itself needs new placeholders matching (1).
3. `src/locales/en.json:668` — `wizard.step.demoBoard.description`
   hardcodes *"a real position from a real game (Go Seigen vs
   Fujisawa Hosai, 1971)"*; replace with asset-agnostic copy (e.g.
   referencing a self-play analysis position, per `0719dbdd`'s own
   commit message).
4. `src/lib/setup-wizard-demo-loader.ts:6-7` (JSDoc header) hardcodes
   *"Go Seigen (B) vs Fujisawa Hosai (W), 1971-05-26, move 117"*.
5. `src/lib/setup-wizard-demo-loader.ts:37-48` —
   `SetupWizardDemoProvenance` interface hardcodes the OLD field set
   (`gameRawId`/`black`/`white`/`date`/`result`/`position`/
   `maxVisits`) — none of these exist on the real asset anymore; this
   needs to become the new field set (or a loosened/generic type),
   and — separately from the asset swap — `assertShape` never
   validates individual `provenance` fields today, so a malformed
   provenance object doesn't fail loudly, it fails silently at the
   display layer. Worth tightening `assertShape` to check the fields
   the new interface actually declares, while this file is being
   touched for the swap anyway.
6. `tests/unit/lib/setup-wizard-demo-loader.test.ts:48-49` — the
   real-asset happy-path assertions (`Go Seigen`/`Fujisawa Hosai`,
   witnessed RED above) must be rewritten against the new provenance
   fields. Its `validAsset()` fixture (lines 21-27) should also move
   to the new field set once (5) lands, so the fixture and the real
   type stay in sync.

**What does NOT need scrubbing:** `useSetupWizardDemoBoard.ts` and
`useSetupWizard.ts` never reference provenance fields by name (they
pass the object through opaquely) — provenance-agnostic as designed.
The rules-engine replay path (`buildDemoBoard`, `fromGtp`) reads only
`raw.moves` (generic) and `raw.provenance.komi` (present in both
shapes), so board hydration itself is unaffected by the shape change
— only the *display* and *test-fixture* layers hardcode the old shape.

---

## Other findings

**ADVISORY — demo-board ledger entry is never released.**
`useSetupWizardDemoBoard.ts` module-memoizes (`let cached`) and calls
`ledger.recordRaw(rawKey, demo.nodeId, demo.rawAnalysis)` once per
app lifetime. The demo `BoardState` is never pushed into
`store.boards` (confirmed: `WizardStepDemoBoard.vue` passes it as a
prop directly to the real `BoardWidget`, never registers it), so it
never goes through `closeBoard`'s ledger-purge path
(`ledger.purgeNodes` is driven by board removal). The one ledger
entry this seeds is therefore permanently un-owned — bounded (exactly
one entry, since memoized) but genuinely leaked per the umbrella
`CLAUDE.md`'s resource-ownership-at-mutation-sites discipline ("what
would happen if the owner exited without releasing"), which asks for
an explicit fix/document/defer decision, not silence. Not a blocker
given the bound, but should get one of: an explicit purge on
`finish()`/wizard-close, or a documented deferral comment at the
`recordRaw` call site.

**Verified clean — demo-board isolation otherwise.** No boards-list
pollution, no persistence-path pollution: the demo board is a bare
prop, never store-registered.

**Verified clean — first-run trigger.** `App.vue`'s
`watch(() => store.workspaceLoadState.kind, ..., { immediate: true })`
gated on `!store.profile.settings.onboarding.completed` is correct:
fresh profile → `onboarding.completed: false` (`defaults.ts`) → wizard
opens; existing/migrated profile → migration 69→70 backfills `true` →
watcher no-ops. Re-run (`SettingsTab.vue`'s button →
`openSetupWizard()`) never touches `completed`.

**Verified clean — migration numbering, content not just number.**
The merge-base between the wizard branch and `next` is `c4be39d9`,
which is an ancestor of `next`, and `migrations.ts`/
`archived-migrations.ts` are byte-identical between `c4be39d9` and
`next` HEAD (`git diff next c4be39d9 -- ...` empty). `next`'s
`CURRENT_SCHEMA_VERSION` is 69 (real `next`, not the stale
`local/next` remote-tracking ref, which is out of date at 67 — don't
consult that one). The branch bumps 69→70 correctly on top of that,
with the correct rolling-archive move (67→68 rolled into the
archive). No renumbering needed; this seam is a non-issue.
`tests/unit/store/migrations.test.ts`'s "69 → 70" describe block
exists (5 assertions: absent-leaf backfill, idempotent both
directions, non-boolean-value replacement, no-op on absent container,
end-to-end walk) — confirmed present and passing.

**Verified clean — skip semantics.** `skip: next` (literal alias) is
a deliberate, documented choice (file header: "there is nothing a
step can leave unset that blocks progress") and is tested
(`useSetupWizard.test.ts`: "skip() has the identical effect as
next() at every step"). Meets the "either shape is fine if
deliberate and tested" bar.

**Verified clean — no wall-clock sleeps in tests.** Grepped
`WizardStepPvAnimation.vue` and all four wizard integration test
files for `setTimeout`/`await new Promise`/`sleep(` — no hits. The
4s auto-advance interval is production-only per the file's own
header ("never awaited in tests").

**Verified clean — i18n literal braces.** All `wizard.*` keys in
`en.json` reviewed by hand (lines 647-696); the only interpolated
strings are `wizard.demoBoard.loadError` (`{message}`) and
`wizard.demoBoard.provenance` (`{black}`/`{white}`/`{date}`/
`{position}` — broken for the reason above, but not a literal-brace
escaping bug).

**Verified clean — ADR-0007 file sizes.** All 13 new/touched
wizard-specific files: largest is `WizardStepPvAnimation.vue` at 163
lines; everything else 32-163 lines. Well under the 250-line SFC
target.

**Verified clean — FILES.md.** Rows present for every new file under
`wizard/`, the three new composables, and `lib/setup-wizard-demo-
loader.ts`. One row (`useEngineUriEditor.ts`) has stale wording —
covered under Seam 1 above, not a new-row omission.

---

## Gates (run myself, memory-capped, exit codes — not grepped)

```
$ nice -n 19 env NODE_OPTIONS=--max-old-space-size=2048 npm run build
✓ built in 5.95s
BUILD EXIT: 0
```

```
$ nice -n 19 env NODE_OPTIONS=--max-old-space-size=2048 \
    VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2 npm run test:run
 Test Files  140 passed | 3 skipped (143)
      Tests  1748 passed | 4 skipped (1752)
exit code 0
```

```
$ nice -n 19 env NODE_OPTIONS=--max-old-space-size=2048 npx eslint .
ESLINT EXIT: 0
```

Red-then-green transcript for a load-bearing test (merge-seam-2's
`setup-wizard-demo-loader.test.ts` real-asset happy path) is in the
"Seam 2" section above.

---

## Self-report cross-check (read last)

`swz-setup-wizard-build.md`'s per-claim evidentiary table is
consistent with what I independently found for everything it claims
WITNESSED, *except* it does not surface either of this review's two
substantive findings:

- It does not know about `next`'s asset replacement (`0719dbdd`) —
  reasonable, since the build report's own base note says it built
  on `c4be39d9`, before that commit landed on `next`. This review's
  Seam-2 findings are new information the builder could not have had.
- It overclaims theme neutrality (B1 above) on the same reasoning the
  wizard code itself relies on ("derived purely from the live cell"),
  without checking what that live cell's *default value* actually is
  for a fresh profile. This is the kind of "locally reasonable but
  wrong" self-report gap fresh-context review exists to catch.

No other divergence between the self-report and my own findings.
