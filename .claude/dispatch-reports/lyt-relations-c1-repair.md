# LYT relations-first amendment — repair of rejected dispatch C1 (ledger row 2435)

Fresh-context repair of `3241525a` (dispatch C1, "authenticated
engine-connected probe harness"), working from the REJECT-verdict
review (`.claude/dispatch-reports/lyt-relations-c1-review.md`, read
end to end) as the specification of what is wrong, not from the
original builder's own report — that file was deliberately not
opened for this repair. The review, the committed
`measure_engine_states.mjs` and `facts.generated.json` (both read in
full), and the probe-contract section (§4) of
`.claude/dispatch-reports/lyt-relations-amendment-spec.md` (also read
in full) are the governing documents for this repair.

## 1. Setup and starting state

`git reset --hard 3241525a` in this worktree; confirmed HEAD at that
commit with `lyt-phase2` (`fd028026`) as its parent, and confirmed
both named artifacts present: `research/lyt/tools/probe_harness/
measure_engine_states.mjs` (21201 bytes) and the 23 new entries in
`research/lyt/facts.generated.json` (35 total: 12 from `lyt-phase2` +
23 from C1).

## 2. The defect, and what was fixed

The review's §2 finding — the committed script could not produce the
committed data — decomposed into four concrete defects, all fixed in
this revision of `measure_engine_states.mjs`:

**(a) Key convention.** `research/lyt/relations.py`'s own documented
grammar (`_split_key`, that file's header) is
`{widget-id}[+widget-id...]|{method}[|variant]` — widget, then
method, then variant. The rejected script built keys as
`widget|variant|method`. Fixed via a single `pushEntry(list, {
widgetId, method, variant, ... })` helper that builds
`key: `${widgetId}|${method}|${variant}`` — the key can no longer
disagree with the fields, because both come from the same call site.

**(b) Field-first binding.** The rejected script never wrote
`widget_ids`/`variant` as explicit JSON fields (only baked them into
the key string). `pushEntry` now always emits `widget_ids: [widgetId]`,
`method`, and `variant` as first-class fields, matching the committed
data's own shape and `FactsTable.load`'s field-first read path
(`relations.py`, confirmed by reading its `_split_key`/`FactsTable.load`
sections).

**(c) Widget-id vocabulary.** The rejected script's engine-state loop
used `I_engine_eval`/`I_engine_health` — ids that exist nowhere in the
census or the compiled encodings. Fixed to the real census ids,
`A_engine_${group}` (`A_engine_eval` / `A_engine_health`).

**(d) The `A_setup` toggle — the mechanism the data credited but the
code never performed.** Traced the real mechanism by reading
`src/composables/chrome/useLytPresenceMenu.ts:263-276` (`toggle()`)
and `src/App.vue:802-816` (`lytPresenceOverrides`, the computed that
actually gates leaf mounting) end to end:

```js
// useLytPresenceMenu.ts:271-276
store.session.ui.lytPresence = {
  ...store.session.ui.lytPresence,
  [id]: !isVisible(id),
};
touchSession();
```

`lytPresenceOverrides` (`App.vue:802-816`) reads
`store.session.ui.lytPresence` directly for `A_setup` — no
special-casing the way `boardRail`/`controlPanel` get (those two are
the only ids that computed overrides). `App.vue:753-767`'s own header
comment confirms the M2-stage "unconditional `A_setup:true`
force-override" (ledger row 2346) was RETIRED by presence arc P2b
item 5 — `A_setup` is a genuine, sovereign 4th toggle target now. (A
second, later App.vue comment near the `leaf-A_setup` template slot,
~line 1327, still narrates the OLD always-forced-visible behavior —
stale, evidently not updated when P2b retired it. The live
`lytPresenceOverrides` body is the ground truth and does not force
`A_setup`; I read the computed's body directly to confirm this rather
than trusting either comment.)

The fixed script performs the identical whole-object-replace write via
the DEV console handle (`window.store.session.ui.lytPresence = {
...window.store.session.ui.lytPresence, A_setup: true }`), then waits
on the real DOM consequence (`page.waitForSelector('.setup-toolkit')`)
rather than a fixed sleep or an assumption.

**Secondary fix — the two `waitForTimeout` calls (review §3).**

- Model-selection settle (was `waitForTimeout(50)`): replaced with
  `page.waitForFunction((sel, val) => document.querySelector(sel)?.value
  === val, ...)`, polling the `<select>`'s own DOM value, which
  `EngineModelSelect.vue`'s `onSelectModel` → `setSelectedModel` →
  `store.engine.selectedModel` round-trips through the `:value`
  binding on the next tick (traced by a research sub-agent reading
  `EngineModelSelect.vue` and `store/index.ts:309-313`).
- Post-hover-move settle (was `waitForTimeout(30)`): replaced with
  `page.waitForSelector('.metrics-popover', { state: 'detached' })`.
  The model-select lives inside the `.eval-summary` hover popover
  (`ToolbarEngineMetrics.vue`, `v-if="evalOpen"` — fully unmounts, not
  CSS-hidden), gated by `useHoverPopover`'s own `closeDelayMs` timer
  (`INTERACTION_DISMISS_DELAY_MS`, 150ms, `lib/timing.ts`). The old
  30ms sleep was racing that same 150ms timer, not actually waiting
  for it — the replacement waits on the popover's real DOM detachment.

## 3. Rig stood up, script run twice, determinism confirmed

Own rig, not the live app:

- Backend: `sqlite+aiosqlite:////tmp/lyt-c1-repair-rig/cards.rig.db`
  (copy of `backend/cards.db`, deleted after the run), `QEUBO_ENABLED=false`,
  `systemd-run --user --scope -p MemoryMax=4G -- nice -n 19 <venv>/python
  -m uvicorn main:app --host 127.0.0.1 --port 19102`.
- Frontend: `VITE_API_BASE_URL=http://127.0.0.1:19102`,
  `VITE_KATAGO_WS_URL=ws://192.168.122.68:1235`, `systemd-run --user
  --scope -p MemoryMax=4G -- nice -n 19 node_modules/.bin/vite --port
  19103 --strictPort`. (Note: `nice`'s `Nice=` systemd property is
  rejected in this environment, so `nice -n 19` is wrapped *inside*
  the `systemd-run` invocation, per the brief's own disclosed
  workaround.)
- `node_modules` copied from the main repo tree after confirming
  `package-lock.json` is byte-identical (avoids a slow fresh `npm
  install`); Playwright's bundled Chromium installed via
  `playwright-core/cli.js install chromium`.
- Real passwordless registration/login against the rig backend; real
  engine connect to `ws://192.168.122.68:1235` model `'14'` (confirmed
  matched against the live advertised set: `["14", "18", "nbttrf",
  "08_01", "b11c768h12nbt3tflrs"]`); FORBIDDEN_HOSTS list covering
  8764/4173/5173/5174 unchanged, zero hits both runs; one Chromium
  instance closed in `finally` both runs.

Ran the fixed script twice against a scratch facts file. **WITNESSED:
24/24 entries byte-identical across both runs** (`0 diffs`, compared
programmatically field-by-field, provenance/date excluded as
expectedly volatile). `connectMechanism: WITNESSED` both times.

Ran a third, official pass with `--facts research/lyt/facts.generated.json`
(the real, git-tracked file) so the `A_app` landscape-baseline
comparison and the `A_engine_controls` width-match comparison resolve
against the genuine pre-existing entries rather than an empty scratch
file. This is the run committed. 24 new/updated entries written; 36
total entries in the final file (35 pre-existing + 1 net-new key —
see §5).

## 4. Diff against the 23 originally-committed entries: what's restored, what's superseded

18 of the 23 originally-committed entries are **byte-identical** to
the regenerated values — the underlying measurements the rejected
commit's data described were, for these 18, real and reproducible
once the script's own bugs were fixed. Provenance is restored for
these:

- `A_engine_health|playwright-boundingBox|disconnected`
- `A_engine_eval|playwright-boundingBox|connected-{1,2,3,4}digit`
- `A_engine_health|playwright-boundingBox|connected-{1,2,3,4}digit`
- `A_app|playwright-boundingBox|portrait-{1200x1600,768x1024,540x960,420x880}`
- `A_app|playwright-boundingBox|landscape-420w-attempted`
- `A_setup|playwright-boundingBox|authenticated-default`

**5 entries differ; all 5 are honest supersessions, tabulated below**
(old committed value → new regenerated value, this repair's commit
keeps the regenerated side):

| Key | Field | Committed (old) | Regenerated (new) | Why |
|---|---|---|---|---|
| `A_engine_eval\|...\|connected-real` | `state` | "...(0ms (idle watchdog probe against ws://.../model 14))" | "...(3ms)" | Real KataGo round-trip latency to an idle engine — genuinely varies run to run over live network; not a script defect. Both are real measurements of the same live quantity at different instants. |
| `A_engine_health\|...\|connected-real` | `state` | same 0ms text | "...(3ms)" | Same as above (paired eval/health read at the same instant). |
| `A_engine_controls\|...\|engine-on` | `state` | "width matches the pre-existing entry exactly (185px)" | same text, same conclusion, when run against the real facts file (see note below) | Textual only; the underlying `value_px: 185` is unchanged both times. |
| `A_app\|...\|landscape-1920x1080-authenticated` | `value_w_px`, `state` | `614.0` | `1920` (see §5, flagged as open, not silently resolved) | Genuine, reproducible remeasurement difference — see §5. |
| `A_setup\|...\|authenticated-toggled` | `state` | includes "Matches the census's own cited grounding figure exactly (Measurement 4: ...)" | drops that clause | The clause was hand-added commentary in the rejected data, not something the harness itself can assert without also reading the census doc; dropped rather than fabricated. **The measured numbers themselves (`value_px: 92`, `value_w_px: 296.34375`) are BYTE-IDENTICAL to the committed data** — see §6, this is the headline restoration for defect (d). |

Note on `A_engine_controls|...|engine-on`: an intermediate scratch run
(pointed at an empty facts file to test determinism) produced "width
measured 185px" instead of "matches the pre-existing entry exactly"
purely because that scratch file had no prior `A_engine_controls`
entry to compare against — not a script bug. The official run against
the real `facts.generated.json` correctly detects the match and
reproduces the exact wording.

**1 net-new key**, not present in either the pre-existing 12 or the
rejected commit's 23: `A_engine_eval|playwright-boundingBox|disconnected`.
The rejected script's disconnected-state block read `.engine-metrics-bar`
as a single combined `I_engine_eval+health` entry and only the health
side survived into a properly-shaped committed key (the eval side's
disconnected state was left implicitly covered by the old
no-variant-suffix `A_engine_eval|playwright-boundingBox` entry from
dispatch A). This repair measures both `eval` and `health` groups
symmetrically per the same per-group loop the "connected" states
already use, so `A_engine_eval|playwright-boundingBox|disconnected`
is now an honest, explicit, field-first entry alongside its `health`
sibling — filling a gap the rejected data left asymmetric rather than
duplicating or contradicting anything.

## 5. Open finding, not silently resolved: `.app-cluster` width swap between committed and regenerated data

`A_app|playwright-boundingBox|landscape-1920x1080-authenticated`'s
`value_w_px` moved from the committed **614px** to the regenerated,
twice-reproduced **1920px**. This is on the *supplementary* width
field, not the load-bearing `value_px` (height, `axis: "v"`), which
agrees at 28px both times — but it is a real, reproducible
measurement difference worth naming rather than silently carrying
forward.

Two candidate explanations, neither confirmed:

1. The originally-committed 614px figure was never a real measurement
   in the first place — consistent with the review's central finding
   that the committed data as a whole could not have come from a
   straight run of the shipped script. If the committed numbers were
   hand-typed/copied from the pre-existing landscape cold-boot entry
   (which is also 614px, from dispatch A, unauthenticated) rather than
   independently measured under the authenticated rig, this would
   explain the coincidence.
2. `.app-cluster`'s rendered width may genuinely differ under an
   authenticated, engine-connected, freshly-registered-user session
   versus the unauthenticated cold boot dispatch A measured — a real
   layout behavior this repair did not investigate further (out of
   scope: this repair's mandate is script/data provenance, not a
   frontend CSS investigation).

Flagged here as an open discrepancy, not resolved. Whoever picks up
dispatch C3 should treat `.app-cluster`'s authenticated-landscape
width as unconfirmed pending a targeted follow-up, not as a settled
614px fact.

## 6. The A_setup matter, restated per the brief's instruction

Census grounding figures (amendment spec §1.4): **66px portrait /
160px landscape**. Measured portrait series (this repair, `A_app`,
axis `v`, five `PORTRAIT_SIZES` points): **28 / 28 / 28 / 50 / 56 px**
across widths 1080→420. Both series are internally consistent with
the rejected commit's own numbers (this repair reproduced all five
portrait entries byte-identical) — the discrepancy between the
census's 66/160px grounding and this harness's measured 28–56px
series is **still open**, unresolved by this repair, and is the item
ledger row 2425 chartered this dispatch to chase. My own worst-case
measured figure in this series is **56px** (portrait, 420×880 — the
narrowest width probed), still well under the census's 66px portrait
figure. Named explicitly here for dispatch C3's model-change table,
per the brief's instruction — not silently reconciled or dropped.

Separately, and by contrast: the `A_setup` toggle-flip **is** now a
genuinely witnessed, reproducible measurement (92px × 296.34375px,
byte-identical across two independent live runs and byte-identical to
the value the rejected commit's data claimed) — this is not part of
the open A_app discrepancy; it is the repair's core restoration.

## 7. Gates

| Gate | Result |
|---|---|
| `research/lyt` pytest suite (own venv, `ortools` + `pytest` installed fresh at `/tmp/lyt-venv-repair`) | **421 passed, exit 0**, 15639 deprecation warnings (unchanged baseline, matches the review's own witness) |
| `test_every_real_facts_entry_method_is_mapped_to_some_primitive` | **PASSED** (run in isolation against the final committed `facts.generated.json`) |
| `test_every_real_facts_entry_resolves_or_is_disclosed_unusable` | **PASSED** (same) |
| Harness determinism | **WITNESSED**: two independent live-rig runs, 24/24 entries byte-identical (0 diffs, provenance/date excluded) |
| Additive-only invariant (the true 12 `lyt-phase2`-original entries) | **WITNESSED**: all 12 confirmed untouched by this repair's own run (the 3 that carry `widget_ids`/`variant` already carried them in the rejected commit `3241525a`, *before* my repair touched anything — confirmed by diffing against a copy taken pre-run) |
| Rig teardown | **WITNESSED**: both `systemd-run` scopes stopped explicitly (`systemctl --user stop`); ports 19102/19103 reprobed free (`ss -tlnp` empty) after teardown; DB copy deleted |
| `node --check` on the fixed script | **PASSED** (syntax) |
| Forbidden-port discipline (8764/4173/5173/5174) | **WITNESSED**: `FORBIDDEN_HOSTS` listener installed both live runs, zero hits |

## 8. Scope discipline

No changes outside `research/lyt/tools/probe_harness/
measure_engine_states.mjs` and `research/lyt/facts.generated.json`.
`relations.py`/`loader.py` untouched (confirmed: not part of this
diff at all). No frontend source files edited — `useLytPresenceMenu.ts`
and `App.vue` were READ to ground the real toggle mechanism, never
written to. No narrowing of the commissioned repair scope occurred;
nothing here rises to a STOP-and-report scope question.

## 9. Deliverable

- Fixed harness: `research/lyt/tools/probe_harness/measure_engine_states.mjs`
- Regenerated facts: `research/lyt/facts.generated.json` (36 entries:
  35 carried forward, 1 net-new key, 5 honest supersessions tabulated
  in §4, 1 open discrepancy flagged in §5)
- This report: `.claude/dispatch-reports/lyt-relations-c1-repair.md`
