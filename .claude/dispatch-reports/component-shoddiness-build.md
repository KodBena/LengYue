# Component-shoddiness repair build — S4, S5, S6, S7, S9, S11, S12

Repair pass against `.claude/dispatch-reports/ui-shoddiness-audit-2026-08-21.md`,
scoped to the component-local findings only. The layout-allocation cluster
(S1/S2/S3/S8/S10) and the LYT layout engine/authority/root-split code were
not touched, per the brief.

Base: `lyt-phase2` @ `829e952c` (reset to this exact commit in the worktree;
`origin/lyt-phase2` had moved ahead to a concurrent builder's commits, which
were deliberately NOT pulled in).

All screenshots cited below were viewed in full before the corresponding fix
was made (`.claude/dispatch-reports/ui-shoddiness-shots/`).

---

## S4 (high) — status bar collision at 1366×768

**Root cause:** `frontend/src/components/board/StatusBar.vue`'s `.status-left`
had no `min-width: 0`, so as a flex item of `.status-bar` it refused to
shrink below its children's combined min-content width. At a bar width
above the 700px narrow-mode threshold (so narrow mode never engaged), that
combined width still exceeded the space actually available, and two
compounding effects followed: `.status-left` rendered at its full natural
width regardless, overrunning into `.status-right` and overlapping the komi
input with the Pass button by ~6px; and `.move-badge`/`.player-names`, having
no `white-space: nowrap`, satisfied their own min-content constraint by
wrapping at a word boundary ("MOVE" / "0", "Black" / "vs" / "White") instead
of eliding. Separately, the komi `<input>` was a bare `border-bottom: dashed`
box at 42×12px, 10px font — well under any usable pointer target and, at
zoom, indistinguishable from a rendering fault.

**Fix (`StatusBar.vue`):**
- `.status-left { min-width: 0 }`, `.status-right { flex-shrink: 0 }` —
  Pass/caps/user-badge are never squeezed; `.status-left` can now actually
  shrink to its allotted share instead of overflowing.
- `.player-names` is now `flex: 1 1 auto; min-width: 32px; white-space:
  nowrap; overflow: hidden; text-overflow: ellipsis;` **unconditionally**
  (previously only under `.status-bar--narrow`) — this is the segment that
  absorbs the shrink; the narrow-mode rule now only tightens the ceiling
  (`max-width: 90px`).
- `.move-badge` and `.game-info` (ruleset + komi) get `white-space: nowrap;
  flex-shrink: 0;` — essential, always-legible, never wrap or get squeezed.
- `.komi-input`: full `border: 1px solid var(--border-3)` (was
  `border-bottom` only) + `padding: 2px 4px` + `min-height: 20px` +
  `box-sizing: border-box` — an honest field outline and a ~20px hit target,
  matching `.status-bar`'s own `min-height`. Focus/hover rule updated from
  `border-bottom` to `border-color` to match the new full-box border.

**Files:** `frontend/src/components/board/StatusBar.vue`

**Evidentiary status:** WITNESSED — `npm run build` and the full Vitest
suite both pass (exit 0; see bottom of this report). No dedicated test was
added: this is a pure-CSS/flex-geometry fix and jsdom has no real layout
engine (the codebase's own stated convention, per
`TabWidget-overflow.test.ts`'s comment, is source-text/computed-style
assertions for CSS shape, not simulated layout — not warranted here for a
flex-shrink interaction). Visual re-witness at 1366×768 is the orchestrator's
rig: **UNEXERCISED**, blocked on no live-service contact in this environment.

---

## S5 (medium) — near-black slab in the light theme

**Root cause:** `HorizontalTimelineVisualizer.vue`'s `.timeline-container`
painted a hardcoded `background-color: #020617` / `border: 1px solid
#1e293b` — a deliberate Tailwind-slate literal whose own comment named the
chrome-substrate sweep as "a separate UX decision." Today's ruling (ledger
row 2511) authorizes doing the container half of that sweep now.

**Fix:** `background-color: var(--surface-0)`, `border: 1px solid
var(--border-2)`. The DATA-adjacent colors (grid lines, selection slider,
handle bar — genuinely a different concern, still deferred per the original
comment) are untouched.

**Files:** `frontend/src/components/tree/HorizontalTimelineVisualizer.vue`

**Evidentiary status:** WITNESSED (build + suite green). No test needed
(pure CSS token substitution). Visual re-witness: UNEXERCISED (same
blocker).

---

## S6 (medium) — orphaned non-square board preview; disclosure triangle far from heading

**Root cause 1 (orphaned preview):** `AnalysisChartPanel.vue`'s
`.preview-box` (wrapping `ChartPreviewBox`, the wood-texture board preview)
rendered unconditionally, regardless of `hasData` — so the "No … data yet."
empty state and an empty board thumbnail rendered side by side.

**Root cause 2 (non-square):** `.preview-box` was a fixed `width: 140px`
inside a `.linear-content` row whose `height: 160px` it stretched to fill
(`align-items: stretch`, no explicit height on the box itself) — 140×159
measured, visibly stretching the Go grid.

**Root cause 3 (disclosure triangle far from heading):** `.header`'s
`justify-content: space-between` pinned the chevron to the panel's far
right edge on a wide panel — ~600px from the label with nothing in
between. The same pattern (`justify-content: space-between` on a full-width
header row) recurs in `MergedDeltaPanel.vue`'s `.mode-header`, which pins
the Delta View mode-cycle button the same way (this is a real interactive
control, not a chevron, but the audit correctly named it as the same
far-from-heading pattern).

**Fix:**
- `AnalysisChartPanel.vue`: `.preview-box` now `v-if="hasData"`.
- `.preview-box` width 140px → 160px (matches the row's own 160px height —
  square). `PREVIEW_HIDE_BELOW_PX` (the narrow-preview-hide threshold)
  updated 379 → 399 to match the new 160+240 sum.
- `.header`: `justify-content: space-between` → `align-items: center; gap:
  var(--space-tight)` (chevron sits immediately after the label; the whole
  row is still the click target, unchanged).
- `MergedDeltaPanel.vue`'s `.mode-header`: same `space-between` → `gap`
  change, adjacent to the "Delta View" heading.
- Retrofitted an ADR-0006 header (pathname + purpose + license) onto
  `AnalysisChartPanel.vue`, which previously had only a one-line comment.

**Files:** `frontend/src/components/charts/AnalysisChartPanel.vue`,
`frontend/src/components/charts/MergedDeltaPanel.vue`

**Evidentiary status:** WITNESSED (build + suite green). No test added —
pure template-conditional + CSS; the existing `chart-empty-state` /
`hasData` gating already has coverage elsewhere in the suite (unaffected,
still green). Visual re-witness: UNEXERCISED (same blocker).

---

## S7 (medium) — oversized dark CodeMirror slab; stray tab-shaped cell

**Root cause (editor sizing):** `PaletteEditor.vue`'s CodeMirror instance
was given `:style="{ height: '100%', ... }"`, forcing it to fill
`.editor-wrap`'s full `flex: 1` share of the 400px-tall panel regardless of
content — a 442×280 dark slab under a single-line formula.

**Fix:** `:style="{ height: 'auto', minHeight: '4.5em', maxHeight: '240px',
fontSize: '12px' }"` — CodeMirror now sizes to its content (formulas are
normally 1–3 lines), with a floor so a one-line formula doesn't collapse to
an uncomfortable strip and a ceiling (internal scroll beyond it) so a
pathological formula can't grow the panel unbounded. `.editor-wrap` itself
is unchanged (`flex: 1; overflow: auto;`) — a content-sized child inside it
leaves the leftover space blank rather than forcing a dark void.

**Stray tab-shaped cell after "Keybindings":** traced the sub-tab strip to
`useSettingsSubTab.ts` (`SETTINGS_SUB_TAB_IDS`, exactly 6 entries, no 7th)
and `TabWidget.vue`'s `<ul class="tab-header"><li v-for="tab in tabs">` (a
plain loop over those 6 entries, no extra sibling element in the DOM). I
could not identify a concrete stray DOM node from source, and per this
worktree's "no live-service contact" constraint I have no browser/DOM
inspector to confirm what's actually rendering at that coordinate — the
umbrella `CLAUDE.md`'s "asking before assuming" / cross-boundary debugging
discipline is explicit that inferring a live-rendering defect from a
screenshot alone, without runtime visibility, risks misdiagnosis. I did not
guess at a fix for an unconfirmed DOM element.

**Files:** `frontend/src/components/editors/PaletteEditor.vue`

**Evidentiary status:** Editor-sizing half — WITNESSED (build + suite
green; no test added, pure inline-style/CSS sizing, same rationale as S4/S5).
Stray-tab-cell half — **UNRESOLVED / not attempted**, for the reason
above; flagging for the orchestrator with browser access to confirm via
live DOM inspection before a fix is attempted.

---

## S9 (medium) — raw internal keys shown as labels

**Root cause:** `RegistryEditor.vue` rendered every leaf/branch registry key
verbatim (`activeTab`, `moveFilterThreshold`, `lytPresence` uppercase-
transformed to "LYTPRESENCE", …) with no human-readable label at all.
Separately, `HyperparamPromptModal.vue` printed the raw wire symbol
(`deck_size`) permanently beside its human label ("Deck size").

**Fix:**
- New module `frontend/src/i18n/registry-labels.ts`: a `PATH_LABELS: Record<string,
  string>` table — the same "dot-joined path relative to the editor's mount
  root → i18n key" convention `RegistryEditor.vue`'s own `PATH_ENUMS`/
  `PATH_TOOLTIPS` tables already use (data, not inline logic — ADR-0012
  P10). Covers every key under `store.session.ui` (`defaultSessionUI` in
  `store/defaults.ts`) — the root the "Session (UI)" tab (the finding named)
  mounts — roughly 39 entries including the nested `lytPresence`,
  `pvAnimation`, `overlayLayers.ownership` groups.
- `RegistryEditor.vue`: `labelKey(key)` looks up `PATH_LABELS`, falling back
  to the raw key itself when unmapped. The template now renders
  `{{ $t(labelKey(key)) }}` instead of `{{ key }}`, for both branch and leaf
  labels; the raw key is still surfaced via `:title="key"` (hover), never
  hidden. **The loud fallback (ADR-0002: don't hide an unmapped key, show it
  AND log it) reuses the app's own existing i18n missing-key mechanism**
  (`i18n/index.ts`'s `missingWarn: true` / `fallbackWarn: true`) rather than
  a second bespoke warn/dedup path: `$t()` on an unmapped raw key (e.g. every
  leaf under the "Advanced Registry" tab's `store.profile.settings` root —
  explicitly out of scope for this pass) returns the key text itself
  (vue-i18n's documented missing-key behaviour) and logs a warning naming
  it. I initially wrote a `useI18n()` + custom `console.warn`-with-Set
  version; reverted it after the test suite caught that `useI18n()` requires
  the i18n plugin installed on the component tree (a footgun this
  simplification also sidesteps — see the test fix below).
- `HyperparamPromptModal.vue`: removed the permanent `<span class="field-name">{{
  d.name }}</span>`; the raw symbol is now on `:title="d.name"` (hover) on
  the label instead of always-visible clutter. Removed the now-dead
  `.field-name` CSS rule.
- Added `registry.label.*` keys (all ~39) and `toolbar.metric.slidersTooltip`
  (see S12) to **all four** locale files (`en.json`, `ja.json`, `ko.json`,
  `zh-CN.json`) — machine-translated by me directly (these three locales are
  already flagged `MACHINE_TRANSLATED_LOCALES` at the app level) rather than
  left as English placeholders, given the short, mostly-technical nature of
  the strings. All four files validated as parseable JSON.
- **Test fix required:** `tests/unit/settings-registry-geometry.test.ts`'s
  two `mount(RegistryEditor, ...)` calls didn't install the i18n plugin
  (their fixtures never previously triggered a `$t` call, since the old
  code path only called `$t` conditionally on `isModified`/`isDynamicNode`,
  both false for those fixtures) — now that every leaf/branch label goes
  through `$t`, the mounts needed `global: { plugins: [i18n] }`, the same
  shape several other component mounts in this test tree already use (e.g.
  `CardSetEditor-name-and-destructive-style.test.ts`). Fixed; both tests
  still assert exactly what they did before (the M6 `registry-root` class
  presence/absence).

**Files:** `frontend/src/i18n/registry-labels.ts` (new),
`frontend/src/components/editors/RegistryEditor.vue`,
`frontend/src/components/modals/HyperparamPromptModal.vue`,
`frontend/src/locales/{en,ja,ko,zh-CN}.json`,
`frontend/tests/unit/settings-registry-geometry.test.ts`

**Scope note:** the "Advanced Registry" tab (`store.profile.settings` root)
is explicitly NOT covered by `PATH_LABELS` — the S9 finding named only
"Session (UI)," and per ADR-0002 Rule 7 (closest-match discipline) I didn't
want to guess human labels for a root I wasn't asked to cover. Its leaves
now fall through to the same loud fallback (raw key shown + a
console-logged missing-translation warning), unchanged in visible behaviour
from before this pass, with the warning now additionally visible to a
developer as a to-do list for a future coverage pass.

**Evidentiary status:** WITNESSED — the specific regression the change
caused was caught by the test suite itself (2 failures → fixed → full
suite green, exit 0). Build green (exit 0). Visual re-witness (that the
Session (UI) tab now reads in plain English): UNEXERCISED (same blocker).

---

## S11 (low) — near-identical corner glyphs

**Root cause:** `App.vue`'s control-panel-summon button (`☰`, U+2630) and
`SystemLogToggle.vue`'s system-log toggle (`≡`, U+2261) both render as
"three horizontal lines" at 28px — visually near-indistinguishable, bound to
unrelated actions, with `☰` the sole route back to the main panel (S1).
Both buttons already carried `:title` and `:aria-label` (verified in
`App.vue`, `LytPresenceMenu.vue`, and `SystemLogToggle.vue` before touching
anything) — the accessible-label half of the finding was already satisfied;
only the glyph differentiation was missing.

**Fix:** `SystemLogToggle.vue`'s glyph changed from `≡` to a terminal prompt
(`>_`) — the conventional glyph for a log/console surface, sharing no shape
family with a hamburger icon. Added a `.log-glyph` rule (monospace, slight
negative tracking) to keep it compact and centred in the 28px box, matching
the single-glyph siblings' visual weight. No corner-stack restructuring
(the button's position, size, and all existing attributes are untouched).

**Files:** `frontend/src/components/chrome/SystemLogToggle.vue`

**Evidentiary status:** WITNESSED (build + suite green; no test references
the glyph's literal character). Visual re-witness: UNEXERCISED (same
blocker).

---

## S12 (low) — dishonest cursor; bare telemetry values

**Root cause 1:** `ToolbarEngineUri.vue`'s `.uri-display` span declared
`cursor: text` while `isContentEditable === false` — a click swaps in a
*separate* `<input>` element; the span itself was never directly editable.

**Fix:** `cursor: text` → `cursor: pointer`, matching the span's own
already-honest `role="button"` semantic instead of contradicting it.

**Root cause 2 (bare telemetry):** `SLIDERS 11` had no unit or explanation.
Investigated `EVAL –/–` / `HEALTH 0pps` too, but found an explicit,
documented design decision in `ToolbarEngineMetrics.vue`
("No native `title` on the trigger itself: the popover IS the 'hover for
more' surface, so a second native tooltip on the same hover would double
up") — both badges already expand into a full hover popover with per-metric
tooltips on the detail rows (`winrateTooltip`/`scoreLeadTooltip`, etc.). I
did not add a `title` there, respecting that documented decision rather
than fighting it without cause (ADR-0004). `ToolbarSliderPopover.vue`'s
`sliders-trigger` button had no such prior decision on record and no
existing hover-hint of what "11" counts.

**Fix:** Added `:title="$t('toolbar.metric.slidersTooltip', { n: count })"`
to the sliders-trigger button — "{n} quick-access knob sliders. Hover to
open." Locale key added to all four locale files (see S9's locale-file
list; same JSON-validity check applies).

**Files:** `frontend/src/components/chrome/ToolbarEngineUri.vue`,
`frontend/src/components/chrome/ToolbarSliderPopover.vue`,
`frontend/src/locales/{en,ja,ko,zh-CN}.json`

**Evidentiary status:** WITNESSED (build + suite green). Visual re-witness:
UNEXERCISED (same blocker).

---

## Findings NOT fixed (flagged, not guessed at)

- **S7's stray tab-shaped cell** — no concrete DOM/CSS cause identified
  from source; needs live browser/DOM inspection (out of this worktree's
  reach). See S7 section above.
- **S12's EVAL/HEALTH "bare values"** — left as-is; the existing hover-
  popover design already surfaces full per-metric detail with tooltips,
  and a code comment explicitly documents why no second native `title` was
  added. Re-litigating that decision wasn't part of this brief and I found
  no new evidence against it.

## Discipline checks

- No `box-shadow`, `transition`, or `blur` introduced.
- All new/touched backgrounds use `--surface-0`; borders use `--border-2`/
  `--border-3` tokens (no new `--surface-1` background use).
- All touched files carry or already carried an ADR-0006 header
  (`AnalysisChartPanel.vue` retrofitted; `registry-labels.ts` new-authored
  with one).
- `frontend/FILES.md` — added an entry for the new
  `src/i18n/registry-labels.ts` under the `i18n/` band (`[B1]`).
- `node scripts/style-tokens-audit.mjs --check` — passes cleanly (253/257
  baseline keys observed; the S5 fix legitimately removed one baseline
  finding, which the tool's ratchet tolerates without requiring a baseline
  edit).

## Verification (WITNESSED, literal exit codes)

```
$ npm run build            → exit 0
$ npx vitest run --maxWorkers=2   → exit 0 (277 files passed, 3 skipped; 3447 tests passed, 8 skipped)
$ npx eslint <touched files>      → 0 errors
$ node scripts/style-tokens-audit.mjs --check   → within baseline
```

No live-service contact was made (ports 4173/5173/5174/8764,
192.168.122.68:1235 all untouched) — all verification is build + suite +
static-audit based, per the brief's constraint. Visual re-witness at the
audited geometries (1366×768 for S4/S11, 1920×1080 for the rest) is the
orchestrator's rig to run.
