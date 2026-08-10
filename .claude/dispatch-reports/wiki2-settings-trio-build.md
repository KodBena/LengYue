# Build report — wiki2 settings trio (pv-fade-knob, registry-group-label, card-visit-ranges)

Worktree: `/home/bork/w/omega/.claude/worktrees/agent-a68dc82bf046d0724`
Branch: `worktree-agent-a68dc82bf046d0724` (rebased onto `origin/next` @ `c8851986` before work — see base-freshness note below)

License note: all edits are to Public Domain (The Unlicense) files per ADR-0006; no new file headers needed (no files created).

## Base freshness (FIRST ACT)

WITNESSED. `git fetch origin` then `git log --oneline -1 HEAD` showed `3378806f` (an ancestor of `origin/next`, not equal to it) and `git log --oneline -1 origin/next` showed `c8851986`. `git merge-base HEAD origin/next` resolved to `3378806f` (= HEAD), confirming HEAD was a strict ancestor with no local divergent commits. Ran `git rebase origin/next` — succeeded cleanly ("Successfully rebased and updated..."). Worktree HEAD is now `origin/next`'s tip plus this session's new commit(s).

## Documentation read (ADR-0002 corollary)

WITNESSED, end to end: `frontend/CLAUDE.md` (575 lines), `docs/adr-synopsis.md` (443 lines), umbrella `CLAUDE.md` (surfaced via system reminder, read in full), `frontend/tests/CLAUDE.md` (surfaced via system reminder, read in full). `docs/dispatch/` was listed (12 entries, all frontend↔backend / frontend↔proxy files carrying "-shipped" / "-consumed" / "-status" suffixes in their own names — none read as an open, unaddressed request); I did not read each end to end since none appeared open by filename, and no claim is made about their content beyond the filename-visible status suffix.

## Item 1 — wiki2-pv-fade-knob (remove the dead PV-fade knob)

**Discovery surfaced (not a scope change, disclosed per the brief's "STOP and report" instruction, but judged in-scope and proceeded):** the wiki text says the knob is "dead" because CSS transitions were purged. That's true for the *visual* effect, but `fadeDurationMs` was still live as *JS-scheduling padding* — `use-pv-animation.ts`'s `scheduleWindow` added it to the window-mode fade-out delay and to `stopPv`'s DOM-release timeout. Since the CSS transition it used to synchronize with is gone, that padding produced no observable effect (an instant opacity swap doesn't need a wait), so I judged this "inert dead time" squarely inside the wiki item's "get rid of it altogether" instruction rather than a narrowing — removed the field outright (not just the knob wrapper) and collapsed the two call sites to their zero-padding equivalent (window mode's fade-out now fires exactly at `windowDurationMs`; `stopPv` clears synchronously). Flagged here per the brief rather than silently reinterpreted.

Changes:
- `src/composables/board/use-pv-animation.ts` — removed `fadeDurationMs` from `PvConfig`/`PvAnimationSettings`/`PV_DEFAULTS`; `scheduleWindow` and `stopPv` no longer reference it; file header and inline comments updated to describe the new (padding-free) timing and to record why the field was removed rather than just made unwritable.
- `src/components/board/MoveSuggestions.vue` — updated the stale `pvCfg.fadeDurationMs` comment (it previously argued the field "remains meaningful" for JS scheduling — no longer true).
- `src/store/defaults.ts` — removed the `display.pv-fade-ms` `KnobDecl` and the `fadeDurationMs: 0` default leaf; updated the neighboring "Animation-duration knobs" comment (was plural, now singular — only `display.move-suggestions-fade-ms` remains).
- `src/store/profile-owner.ts` — updated two doc comments that named `display.pv-fade-ms` as one of two `session.ui.*`-targeting seeded knobs; only `display.move-filter-threshold` remains.
- `src/lib/timing.ts` — dropped `fadeDurationMs` from the PV-animation timings inventory comment.
- `src/locales/en.json` — `wizard.pvAnimation.mode.window.settings` no longer parenthesizes `(fadeDurationMs)`, since that config no longer exists (English-only key; `ja`/`ko`/`zh-CN` never carried the wizard.pvAnimation family, confirmed by grep before editing).
- **Schema migration 73 → 74** (`src/store/migrations.ts`, `CURRENT_SCHEMA_VERSION` 73→74): strips `profile.settings.knobs['display.pv-fade-ms']` and `session.ui.pvAnimation.fadeDurationMs` from persisted blobs, idempotent, `witnessedContainer`-guarded on both parent containers. Per the rolling-archive discipline (frontend/CLAUDE.md), moved migration `71 → 72` verbatim into `src/store/archived-migrations.ts` (cut-and-paste, comment header updated: "1 → 2 through 71 → 72", 71 entries) so the active file keeps exactly the latest two (`72 → 73`, `73 →74`).
- Test updates: `tests/integration/migration-store-roundtrip.test.ts` (removed the six now-stale `EXPECTED_DEFAULTS_ONLY_PATHS` entries for `display.pv-fade-ms`, updated the adjacent comment); `tests/unit/lib/knobs.test.ts` (the allowlist fixture's second synthetic `session.ui.*` decl no longer claims to mirror the real `display.pv-fade-ms` — swapped for an explicitly-synthetic id/path with an honest comment); `tests/unit/store/migrations.test.ts` (new `describe('73 → 74: ...')` block, 4 tests: decl-delete, leaf-delete, idempotent-on-absence, end-to-end walk).

**Discovered but out of scope, flagged for the commissioner:** `docs/notes/vestige/deferred-items/pv-animation-defaults-calibration.md` is a *dissolved* deferred-items vestige pointing at an OPEN work-status item (`pv-animation-defaults-calibration` in the `todo` Postgres store) about whether `stepDelayMs`/`windowDurationMs`/`fadeDurationMs`/`pvOpacity` are pairwise-calibrated. My change removes one of the four coupled values (`fadeDurationMs`) entirely. This worktree has no `services_local.gitignore` (it's gitignored, per-machine, not present in an isolated worktree) and I have no DB credentials here, so I could not query/update that work-status item myself. UNEXERCISED — needs a human/orchestrator with DB access to either close or amend that item now that one of its four axes no longer exists.

**Gate evidence:** WITNESSED — `npm run test:run` exit 0 (2905 passed, 4 skipped, 0 failed) and `vue-tsc --noEmit` exit 0, both after this item's changes (run together with items 2/3 below — see "Gates" section).

## Item 2 — wiki2-registry-group-label (heading above the Session (UI) registry container)

Found the "registry container" — `SettingsTab.vue`'s `#session` sub-tab template wraps `RegistryEditor :registry="store.session.ui"` in a `<div class="registry-container">`, and `.registry-container` (shared-chrome.css) carries `overflow-y: auto` — the scrollable box the wiki item names, sitting directly below three non-scrolling rows (re-run-wizard button, theme select, settings-tabs-orientation select, proxy-upstream field).

Added an `<h4 class="registry-group-label">` immediately above the container, bound to a new i18n key `settings.label.sessionRegistry`. Styling follows the existing heading convention in this exact neighborhood — `KnobRegistryEditor.vue`'s per-domain `.knob-registry-domain-label` (uppercase, `--text-emphasis`, 600 weight, `--text-0` color, no dimmer token) — rather than inventing a new heading idiom.

Locale keys added by hand, preserving each file's byte-aligned column-42 padding convention (verified with `python3 -c "import json; json.load(...)"` after each edit — all four files still parse):
- `src/locales/en.json`: `"settings.label.sessionRegistry": "Session settings registry"`
- `src/locales/ja.json`: `"セッション設定レジストリ"`
- `src/locales/ko.json`: `"세션 설정 레지스트리"`
- `src/locales/zh-CN.json`: `"会话设置注册表"`

(These three are machine-produced by me, not a native-speaker review — flagged honestly; the codebase's existing `localePicker.machineTranslatedTooltip` convention exists for exactly this situation, though wiring that tooltip onto this one string was not requested and would be scope creep.)

**Gate evidence:** WITNESSED — same combined test/typecheck run as item 1, both exit 0.

## Item 3 — wiki2-card-visit-ranges (explicate a/b ranges, verify negative-b parsing)

Found the feature: `VisitsLerpConfig.vue` under Settings → Other → "Card Visit-Count Override" (`other.section.visitsLerp`), backed by `state/visits-lerp.ts`'s `lerpVisits(x, {a,b}) = round(a*x + b)`, floored to a minimum of 1.

**Parsing verification (the "make sure ... doesn't fail to parse the signedness of b" clause):** traced the full chain — `<input type="number" step="1"> → v-model.number → setVisitsLerpB(value: number) → visitsLerpParams.value.b → lerpVisits`. No custom string-parsing, no `parseInt`/regex/`Math.abs` anywhere in this chain; `v-model.number` uses Vue's own numeric coercion (`Number()`-equivalent), which handles a leading `-` correctly. `setVisitsLerpB` only gates on `Number.isFinite`, never on sign. **Conclusion: the mechanics already correctly parse and apply a negative `b` — no fix was needed.** Existing coverage already exercised negative `b` (`tests/unit/visits-lerp.test.ts`'s floor-to-1 cases; `tests/integration/useReviewSession.test.ts`'s `setVisitsLerpB(-1000)` end-to-end case), but every existing negative-`b` case happened to land at the floor (1), which is indistinguishable from a sign-parsing bug that clamps everything to 1. Added one new test, `'a negative b genuinely subtracts (not just a floor-to-1 coincidence)'` (`tests/unit/visits-lerp.test.ts`), asserting `lerpVisits(100, {a:1, b:-30}) === 70` and `lerpVisits(1000, {a:2, b:-500}) === 1500` — results that are only reachable if the sign of `b` actually threads through the subtraction, closing the coincidence gap. WITNESSED: this test passed as part of the full suite run.

**Range display:** added a `<p class="range-hint">` immediately below each input in `VisitsLerpConfig.vue`, reading (en) "Allowed range: a ∈ (0, ∞)" and "Allowed range: b ∈ (−∞, ∞) — negative values subtract" — new locale keys `visitsLerp.multiplierRange` / `visitsLerp.offsetRange`, en.json only (this whole feature family — `visitsLerp.*`, `other.section.visitsLerp` — was already English-only before my change; confirmed by grep that `ja`/`ko`/`zh-CN` never carried any `visitsLerp.*` key, so I followed the existing precedent rather than introducing a new one). Styled with `--text-0` (max-contrast rule — de-emphasis by smaller font-size, `var(--text-body)`, never by a dimmer color token).

Note: `a`'s range is stated as `(0, ∞)` per the wiki text, but the underlying `setVisitsLerpA` does not itself enforce `a > 0` (only `Number.isFinite`) — a user can still enter `0` or a negative `a`, which `lerpVisits`'s floor-to-1 clamp makes safe but not meaningfully described by the multiplier's intent. The wiki item asked only to *display* the range, not to *enforce* it, so I did not add validation — flagging the gap between "documented range" and "enforced range" for the commissioner's awareness, not fixing it as an undisclosed scope expansion.

**Gate evidence:** WITNESSED — same combined run, exit 0.

## Gates (combined run across all three items)

Run from `frontend/` in this worktree (after `npm ci`, since `node_modules` was absent):

- `nice -n 19 env NODE_OPTIONS=--max-old-space-size=2048 VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2 npm run test:run` — **exit 0**. `Test Files 233 passed | 3 skipped (236)`, `Tests 2905 passed | 4 skipped (2909)`. No failures.
- `nice -n 19 npx vue-tsc --noEmit` — **exit 0**. No output (clean).

Both run to completion in-band (not backgrounded), per the dispatch brief's explicit instruction.

## Standing design law — self-check

- No `box-shadow`, CSS `transition`, or `blur` introduced (the `use-pv-animation.ts` and `MoveSuggestions.vue` comments explicitly document the transition ban rather than reintroducing one).
- All new readable text uses `var(--text-0)`; no `--text-1`/`--text-2`; disabled-only elements untouched.
- No diffuse transparent overlays introduced; new `.registry-group-label` and `.range-hint` use existing surface/text tokens, no backgrounds added.
- No new interactive controls added (the new elements are a heading and two hint paragraphs — no pointer-target floor concern).

## File-size note (ADR-0007), disclosed not fixed

`src/components/SettingsTab.vue` was already over its 250-line SFC budget before this session (290 lines at `origin/next`); my item-2 addition (heading + i18n binding + CSS block) brings it to 313. A full component-decomposition to bring it back under budget was judged out of proportional scope for a settings-pane labelling fix (ADR-0004 minimal-touch) — flagged per ADR-0007's own "refactoring oversized files is incremental, not a sweep" posture rather than silently left unmentioned. `src/store/migrations.ts` moved the opposite direction (292 → 273 lines, well under its 300-line "coherent state machine" ceiling) because the rolling-archive move removed more than the new migration added.

## Documentation-graph check

No files were created, moved, renamed, or re-cross-referenced — only content edits inside existing files (plus one new schema migration, which is data, not a doc-graph node). `node tools/doc-graph/generate.mjs` was judged not required; I did not run it. `FEATURES.md` was checked (grepped for "pv-fade", "visit-count override", "lerp", "multiplier") — the PV-fade knob was never mentioned there, the a/b LERP feature isn't documented there at all (pre-existing gap, not touched or worsened by this session), and the per-card sticky-override entry that IS there is a different feature from the one this item touches. No FEATURES.md edit made.

## Commit(s)

See the final message for branch/commit SHA(s) — filed as an ordinary session commit in this worktree, not pushed, per the dispatch brief.
