# LYT relations-first amendment — dispatch C3: the encoding rewrite proper

Ledger rows governing this dispatch: 2400 (commissioner rulings),
2403 (both-664s rider), 2419/2425 (I_engine envelope rider), 2426
(fixture-move ruling, already discharged by C2), 2427 (decomposition
into C1/C2/C3), 2436 (C3 unblocked, A_app/envelope riders). New rows
written by this dispatch: 2437–2442 (ledger-policy source-file
change entries).

**Base freshness.** HEAD at dispatch start was `3378806f` (a stale
dependabot merge, missing C1 and C2's work). Rebased onto
`lyt-phase2` (`0d577750`) before any edit — confirmed both
`research/lyt/fixtures/transcription/` (C2) and
`research/lyt/tools/probe_harness/measure_engine_states.mjs` (C1)
present after the rebase, plus `A_engine_*` entries in
`facts.generated.json`. Both cited dispatch reports
(`lyt-relations-amendment-spec.md`, `lyt-relations-a-relocation-
probe.md`) present in the worktree — no STOP condition on either
front.

**Reading list discipline.** Read the spec's §1 (census) and §3
(grammar sketches) end to end — in practice the whole 628-line file
was read in one pass since it fit budget, not merely the two
sections; nothing beyond what was asked was cited from partial
reads. Read `test_relations.py` (dispatch B's 46 tests) end to end
as the grammar-by-example reference, plus `relations.py`'s module
docstring in full. Read both encodings' program bodies (post-header)
end to end. Read `facts.generated.json` and `facts.residue.json` in
full. Read the relocation probe report's §1 (relocation
itemization). Consulted ledger rows 2403/2436 (and, for necessary
disambiguation of the "I_engine envelope" instruction and the
post-C2 fixture-move state, rows 2400/2419/2425/2426/2427 — terse
structured ledger records, not full documents, consulted under
"asking before assuming," not a substitute for the trimmed reading
list).

---

## 1. Both rewritten encodings, in full

### `research/lyt/encodings/lengyue_landscape.lyt` (61 lines, was 1479; zero comments)

```
layout lengyue-landscape =
  {min 0px, pref 1fr, max inf, gap 12px} H(
    @toggle(user, release) {168px} boardRail[common, info+action],
    {pref 1fr} V(
      {pref maximize, aspect 1} B[board],
      {24px} I_board[board, info],
      {28px} A_board[board, action]
    ),
    {min 345px, pref 32fr, max sum-of(read-constant(sideColumnMaxCap, landscape), 60ch), gap 4px} V(
      {80px, envelope: {disconnected, connected}, gap 4px} H(
        {min width-of(A_engine_controls, disconnected), pref 1fr, content bounded} A_engine_controls[go, action],
        {pinned max-over(width-of(A_engine_eval, connected-real), width-of(A_engine_eval, connected-1digit), width-of(A_engine_eval, connected-2digit), width-of(A_engine_eval, connected-3digit), width-of(A_engine_eval, connected-4digit), width-of(A_engine_eval, connected-5digit)), envelope: {connected-real: width-of(A_engine_eval, connected-real), connected-1digit: width-of(A_engine_eval, connected-1digit), connected-2digit: width-of(A_engine_eval, connected-2digit), connected-3digit: width-of(A_engine_eval, connected-3digit), connected-4digit: width-of(A_engine_eval, connected-4digit), connected-5digit: width-of(A_engine_eval, connected-5digit)}, content bounded} A_engine_eval[go, info],
        {pinned max-over(width-of(A_engine_health, connected-real), width-of(A_engine_health, connected-1digit), width-of(A_engine_health, connected-2digit), width-of(A_engine_health, connected-3digit), width-of(A_engine_health, connected-4digit), width-of(A_engine_health, connected-5digit)), envelope: {connected-real: width-of(A_engine_health, connected-real), connected-1digit: width-of(A_engine_health, connected-1digit), connected-2digit: width-of(A_engine_health, connected-2digit), connected-3digit: width-of(A_engine_health, connected-3digit), connected-4digit: width-of(A_engine_health, connected-4digit), connected-5digit: width-of(A_engine_health, connected-5digit)}, content bounded} A_engine_health[go, info],
        {pref 1fr, content bounded} A_engine_queue[go, info]
      ),
      @demote(h 616px) {pinned height-of(A_app, cold-boot-default), content bounded, activity occasional} A_app[common, action],
      @toggle(user, release) {pinned height-of(A_setup, authenticated-toggled), content bounded, activity occasional} A_setup[common, action],
      {pref 1fr, gap 4px} H(
        {min 110px, pref 1fr, max inf} tree[board, info+action],
        @demote(h sum-of(max-over(children.min), tree.min, gap)) {pinned max-over(children.min)} T(
          {min read-constant(CP-library, landscape), pref 1fr, max inf, boundary, content unbounded, scroll v, elastic h, floor v 160px, edge v unit, unit v 32px} CP-library[common],
          {min read-constant(CP-cards, landscape), pref 1fr, max inf, boundary, content unbounded, scroll v, elastic h, floor v 160px, edge v unit, unit v 39px} CP-cards[common],
          {min pack-rows(items: [113px, 177px, 153px, 153px, 137px, 105px], target-rows: 2, search-ceiling: 838px), pref 1fr, max inf, gap 4px} V(
            {77px, boundary, content bounded} settingsSubstrip[common],
            {min 200px, pref 1fr, max inf} T(
              {min read-constant(SP_session, landscape), pref 1fr, max inf, boundary, content bounded} SP_session[common],
              {min read-constant(SP_analysisEnv, landscape), pref 1fr, max inf, boundary, content bounded} SP_analysisEnv[common],
              {min read-constant(SP_cardSets, landscape), pref 1fr, max inf, boundary, content bounded} SP_cardSets[common],
              {min read-constant(SP_advancedRegistry, landscape), pref 1fr, max inf, boundary, content unbounded, scroll v, elastic h, floor v 200px, edge v item} SP_advancedRegistry[common],
              {min read-constant(SP_analysis, landscape), pref 1fr, max inf, boundary, content bounded} SP_analysis[common],
              {min read-constant(SP_keybindings, landscape), pref 1fr, max inf, boundary, content unbounded, scroll v, elastic h, floor v 200px, edge v item} SP_keybindings[common]
            )
          ),
          {min sum-of(80px, 4px, read-constant(AT_multires)), pref 1fr, max inf, gap 4px} V(
            {min 80px, pref 80px, max 80px, boundary, content designed} timelineStrip[go],
            {min 160px, pref 1fr, max inf} T(
              {min 160px, pref 1fr, max inf, gap 4px} V(
                {pinned read-constant(AT_basic_interval), boundary, content designed} AT_basic_interval[go],
                {min read-constant(AT_basic_scoreLead), pref 1fr, max inf, boundary, content designed} AT_basic_scoreLead[go],
                {min read-constant(AT_basic_mergedDelta), pref 1fr, max inf, boundary, content designed} AT_basic_mergedDelta[go]
              ),
              {min 160px, pref 1fr, max inf, gap 4px} V(
                {min read-constant(AT_dist_deltaDist), pref 1fr, max inf, boundary, content designed} AT_dist_deltaDist[go],
                {min read-constant(AT_dist_mistakeGap), pref 1fr, max inf, boundary, content designed} AT_dist_mistakeGap[go]
              ),
              {min 160px, pref 1fr, max inf, gap 4px} V(
                {min read-constant(AT_stab_stability), pref 1fr, max inf, boundary, content designed} AT_stab_stability[go],
                {min read-constant(AT_stab_crossCorr), pref 1fr, max inf, boundary, content designed} AT_stab_crossCorr[go]
              ),
              {min read-constant(AT_multires), pref read-constant(AT_multires), max inf, boundary, content designed} AT_multires[go]
            )[ANALYSIS TABS]
          ),
          {min 204px, pref 1fr, max inf, gap 4px} V(
            {264px, boundary, content designed} otherColorDebug[debug],
            {min read-constant(otherBand, landscape), pref 1fr, max inf, boundary, content unbounded, scroll v, edge v continuous} otherBand[common]
          )
        )[BLACK BOX],
        @toggle(user, release) {min 160px, pref 160px, max 160px, aspect 1} previewBoard[common, info]
      )
    )
  )
```

### `research/lyt/encodings/lengyue_portrait.lyt` (59 lines, was 524; zero comments)

```
layout lengyue-portrait =
  {min 0px, pref 1fr, max inf, gap 12px} V(
    @toggle(user, release) {168px, activity occasional} boardRail[common, info+action],
    @demote(h 616px) {pinned max-over(height-of(A_app, portrait-1080x1920), height-of(A_app, portrait-1200x1600), height-of(A_app, portrait-768x1024), height-of(A_app, portrait-540x960), height-of(A_app, portrait-420x880)), content bounded, activity occasional} A_app[common, action],
    @toggle(user, release) {pinned height-of(A_setup, authenticated-toggled), content bounded, activity occasional} A_setup[common, action],
    {pref 1fr} V(
      {width 100fr, aspect 1} B[board],
      {24px} I_board[board, info],
      {28px} A_board[board, action]
    ),
    {80px, envelope: {disconnected, connected}, gap 4px} H(
      {min width-of(A_engine_controls, disconnected), pref 1fr, content bounded} A_engine_controls[go, action],
      {pinned max-over(width-of(A_engine_eval, connected-real), width-of(A_engine_eval, connected-1digit), width-of(A_engine_eval, connected-2digit), width-of(A_engine_eval, connected-3digit), width-of(A_engine_eval, connected-4digit), width-of(A_engine_eval, connected-5digit)), envelope: {connected-real: width-of(A_engine_eval, connected-real), connected-1digit: width-of(A_engine_eval, connected-1digit), connected-2digit: width-of(A_engine_eval, connected-2digit), connected-3digit: width-of(A_engine_eval, connected-3digit), connected-4digit: width-of(A_engine_eval, connected-4digit), connected-5digit: width-of(A_engine_eval, connected-5digit)}, content bounded} A_engine_eval[go, info],
      {pinned max-over(width-of(A_engine_health, connected-real), width-of(A_engine_health, connected-1digit), width-of(A_engine_health, connected-2digit), width-of(A_engine_health, connected-3digit), width-of(A_engine_health, connected-4digit), width-of(A_engine_health, connected-5digit)), envelope: {connected-real: width-of(A_engine_health, connected-real), connected-1digit: width-of(A_engine_health, connected-1digit), connected-2digit: width-of(A_engine_health, connected-2digit), connected-3digit: width-of(A_engine_health, connected-3digit), connected-4digit: width-of(A_engine_health, connected-4digit), connected-5digit: width-of(A_engine_health, connected-5digit)}, content bounded} A_engine_health[go, info],
      {pref 1fr, content bounded} A_engine_queue[go, info]
    ),
    {min 140px, pref 1fr, gap 4px} H(
      {min read-constant(tree), pref 1fr, max inf} tree[board, info+action],
      @demote(h sum-of(max-over(children.min), tree.min, gap)) {pinned max-over(children.min)} T(
        {min read-constant(CP-library, portrait), pref 1fr, max inf, boundary, content unbounded, scroll v, elastic h, floor v 200px, edge v unit, unit v 32px} CP-library[common],
        {min read-constant(CP-cards, portrait), pref 1fr, max inf, boundary, content unbounded, scroll v, elastic h, floor v 200px, edge v unit, unit v 39px} CP-cards[common],
        {min pack-rows(items: [113px, 177px, 153px, 153px, 137px, 105px], target-rows: 2, search-ceiling: 838px), pref 1fr, max inf, gap 4px} V(
          {77px, boundary, content bounded} settingsSubstrip[common],
          {min 200px, pref 1fr, max inf} T(
            {min read-constant(SP_session, portrait), pref 1fr, max inf, boundary, content bounded} SP_session[common],
            {min read-constant(SP_analysisEnv, portrait), pref 1fr, max inf, boundary, content bounded} SP_analysisEnv[common],
            {min read-constant(SP_cardSets, portrait), pref 1fr, max inf, boundary, content bounded} SP_cardSets[common],
            {min read-constant(SP_advancedRegistry, portrait), pref 1fr, max inf, boundary, content unbounded, scroll v, elastic h, floor v 200px, edge v item} SP_advancedRegistry[common],
            {min read-constant(SP_analysis, portrait), pref 1fr, max inf, boundary, content bounded} SP_analysis[common],
            {min read-constant(SP_keybindings, portrait), pref 1fr, max inf, boundary, content unbounded, scroll v, elastic h, floor v 200px, edge v item} SP_keybindings[common]
          )
        ),
        {min sum-of(80px, 4px, read-constant(AT_multires)), pref 1fr, max inf, gap 4px} V(
          {min 80px, pref 80px, max 80px, boundary, content designed} timelineStrip[go],
          {min 200px, pref 1fr, max inf} T(
            {min 200px, pref 1fr, max inf, gap 4px} V(
              {pinned read-constant(AT_basic_interval), boundary, content designed} AT_basic_interval[go],
              {min read-constant(AT_basic_scoreLead), pref 1fr, max inf, boundary, content designed} AT_basic_scoreLead[go],
              {min read-constant(AT_basic_mergedDelta), pref 1fr, max inf, boundary, content designed} AT_basic_mergedDelta[go]
            ),
            {min 200px, pref 1fr, max inf, gap 4px} V(
              {min read-constant(AT_dist_deltaDist), pref 1fr, max inf, boundary, content designed} AT_dist_deltaDist[go],
              {min read-constant(AT_dist_mistakeGap), pref 1fr, max inf, boundary, content designed} AT_dist_mistakeGap[go]
            ),
            {min 200px, pref 1fr, max inf, gap 4px} V(
              {min read-constant(AT_stab_stability), pref 1fr, max inf, boundary, content designed} AT_stab_stability[go],
              {min read-constant(AT_stab_crossCorr), pref 1fr, max inf, boundary, content designed} AT_stab_crossCorr[go]
            ),
            {min read-constant(AT_multires), pref read-constant(AT_multires), max inf, boundary, content designed} AT_multires[go]
          )[ANALYSIS TABS]
        ),
        {min 204px, pref 1fr, max inf, gap 4px} V(
          {min 264px, pref 264px, max 264px, boundary, content designed} otherColorDebug[debug],
          {min read-constant(otherBand, portrait), pref 1fr, max inf, boundary, content unbounded, scroll v, edge v continuous} otherBand[common]
        )
      )[BLACK BOX],
      @toggle(user, release) {pinned read-constant(previewBoard, portrait), aspect 1} previewBoard[common, info]
    )
  )
```

---

## 2. Model-change table

Every entry below was independently verified by loading the encoding
through the real loader and reading the resolved `Sizing` off the
in-memory tree (not assumed from arithmetic) — WITNESSED throughout.
Solver verdicts are `compiler.solve_lexicographic` results at
`runner.SCREEN_SIZES` (1920×1080 / 2560×1440 / 1280×1024 /
1080×1920-portrait), matching the pre-existing baseline pattern
exactly except where a row below discloses an intentional flip.

| Site | Old value | New value | Driving fact / relation | Solver verdict at representative sizes |
|---|---|---|---|---|
| `T(...)[BLACK BOX]` pin (both classes) | `min 664px, pref 664px, max 664px` (hand literal) | `{pinned max-over(children.min)}` | Computed from the five T-children's own declared `min` (`CP-library`/`CP-cards`=160/200, `CP-settings`-V=443 via `pack-rows`, `CP-analysis`-V=664, `CP-other`-V=204) | **Number UNCHANGED (664, both classes)** — see the "both-664s finding" below for why. 1920×1080/2560×1440 OPTIMAL, 1280×1024 INFEASIBLE (landscape; pre-existing, unrelated), all four portrait points OPTIMAL/INFEASIBLE matching baseline exactly. |
| `T(...)[BLACK BOX]` `@demote` threshold (landscape) | `778px` (hand arithmetic `664+110+4`) | `sum-of(max-over(children.min), tree.min, gap)` = `778px` | Same T-pin (664) + tree's own 110 + the row's own 4px gap | Number UNCHANGED (778) — a direct consequence of the T-pin staying 664. |
| `T(...)[BLACK BOX]` `@demote` threshold (portrait) | `808px` | Same formula = `808px` | 664 + tree's 140 + 4 | Number UNCHANGED (808). |
| CP-analysis's own V-wrapper `min` (both classes) | `664px` (hand literal, "the analysis tab's own hand-typed min") | `sum-of(80px, 4px, read-constant(AT_multires))` = `664px` | `timelineStrip`'s own fixed 80px height + the wrapper's own 4px gap + `AT_multires`' own read-constant 580px height | **Number UNCHANGED (664).** See finding below. |
| `A_app` (landscape) | `160px` fixed | `{pinned height-of(A_app, cold-boot-default)}` = `28px` | C1's real cold-boot facts entry (`.app-cluster`, axis v) | **28px, down from 160** — genuine model change per row 2436's rider. All four representative sizes: verdicts UNCHANGED vs. baseline (a smaller floor never removes feasibility). |
| `A_app` (portrait) | `66px` fixed | `{pinned max-over(height-of(A_app, portrait-1080x1920), …, portrait-420x880)}` = `56px` | Worst-case over C1's five portrait-state facts (28/28/28/50/56) | **56px, down from 66** — genuine model change per row 2436's rider. All four representative-size verdicts unchanged. |
| `A_engine_controls` own `min` (both classes) | `185px` (hand literal) | `min width-of(A_engine_controls, disconnected)` = `185px` | C1's own disconnected-state facts entry | Number unchanged (185); representation only. |
| `A_engine_eval`/`A_engine_health` (both classes) | `pref 1fr` (no `min` at all — the census's own "DISCLOSED GAP") | `{pinned max-over(width-of(…, 5 connected-latency states))}` = `139px`, `envelope: {…five states…}` | C1's five connected-latency facts, all `139px` exactly (`the max computes identically`, row 2436(c)) | **NEW real floor (139px each), where none existed before.** All four `runner.SCREEN_SIZES` verdicts unchanged (both classes have ample row width there) — **but** at a SEPARATE, narrower test point (`default` valuation, portrait, `420x880`, exercised by `test_lengyue_...overlay_json...` / `test_p2d_portrait_tree_orientation...`) this NEW floor pushes the engine-controls row's own demand (185+139+139+3×4=475px) past the available width, flipping that one point **OPTIMAL → INFEASIBLE**. Both affected tests updated with a disclosed rationale (§5 below), not silently left red. |
| `A_setup` (both classes) | `92px` fixed | `{pinned height-of(A_setup, authenticated-toggled)}` = `92px` | C1's own toggled-visible facts entry | Number unchanged (92); representation only. |
| `tree` floor (portrait) | `140px` (read off `TREE_PANEL_MIN_WIDTH_PX` by hand) | `min read-constant(tree)` = `140px` | `layout-model.ts`'s own constant, read via the facts table | Number unchanged; representation only. |
| `tree` floor (landscape) | `110px` | UNCHANGED, still a literal | No facts entry exists for landscape's own solver-only relaxation of the constant (disclosed by the census itself as a deliberate non-live-read) | Not touched — no reachable relation. |
| `CP-library`/`CP-cards` `min`+`floor v` (both classes) | `160px`/`200px` (hand literal, both fields) | `read-constant(CP-library/CP-cards, landscape/portrait)` for `min`; `floor v` left literal (see §4, substrate limitation) | `facts.residue.json`'s own narrowed-WRAPPER_MIN entries | Numbers unchanged; `min` now a relation, `floor v` still literal (grammar limitation, not a choice). |
| `SP_session`/`…6 leaves` `min` (both classes) | `200px` (hand literal, all six, both classes) | `read-constant(SP_*, landscape/portrait)` = `200px` | `facts.residue.json`'s six-widget shared entry — **CORRECTED during this dispatch**: the entry's own `landscape` variant carried a stale `160px` (copy-pasted from CP-library's own landscape figure); the live encoding's own literal was always `200px` in BOTH classes. Fixed in `facts.residue.json` (see §4). | Numbers unchanged from the live encoding's own pre-dispatch value (200); the FACTS FILE's own value was the thing corrected, not the encoding. |
| `otherBand` `min` (both classes) | `160px`/`200px` | `read-constant(otherBand, landscape/portrait)` | `facts.residue.json` | Numbers unchanged; representation only. |
| Side-column `max` cap (landscape) | `340px+60ch` (the `340px` ungrounded) | `sum-of(read-constant(sideColumnMaxCap, landscape), 60ch)` = `820px` | New residue entry (`sideColumnMaxCap`, 340, already present pre-dispatch in `facts.residue.json`) | Number unchanged (820px resolved, matching the encoding's own header prose); `60ch` stays a literal (no `text-width-of` facts coverage — disclosed gap, not fixable this wave). |
| `previewBoard` (portrait) | `96px` fixed, three fields | `{pinned read-constant(previewBoard, portrait)}` | `facts.residue.json`'s aesthetic-downscale entry | Number unchanged (96); representation only. |
| `previewBoard` (landscape) | `160px` fixed, three fields | UNCHANGED, still a literal | No facts entry exists for landscape's own previewBoard box | Not touched — no reachable relation. |
| `AT_multires` (both classes) | `min 580px, pref 580px, max inf` | `min read-constant(AT_multires), pref read-constant(AT_multires), max inf` | `MultiresolutionIntervalPanel.vue:153`'s own CSS rule, via `facts.generated.json` | Number unchanged (580); **`max` deliberately NOT converted to `pinned`** — see the substrate-bug-adjacent finding in §4 (using `pinned` here silently caps `max` at 580 too, which is exactly what broke feasibility during this dispatch's own bisection). |
| `AT_basic_interval` (both classes) | `min 90px, pref 90px, max 90px` | `{pinned read-constant(AT_basic_interval)}` | `facts.residue.json`'s estimated entry | Number unchanged (90); representation only — safe to pin here since the ORIGINAL was already fully fixed (min=pref=max), unlike `AT_multires`. |
| `AT_basic_scoreLead`/`mergedDelta`/`AT_dist_*`/`AT_stab_*` (6 leaves, both classes) | `min 200px` | `min read-constant(WIDGET)` | `facts.residue.json`'s six estimated entries | Numbers unchanged (200 each); representation only. |
| `board`/`previewBoard` `aspect 1` (both classes, 4 sites) | Literal `aspect 1` | **UNCHANGED, still literal** | `aspect-of(board)` is a resolvable primitive (a NEW domain-invariant residue entry was added, see §4) but **`aspect` is not wired to accept a relation in the concrete grammar this wave** (`parser.py`'s `aspect` key demands a bare `NUMBER` token) — a disclosed, discovered narrowing (spec §2 primitive 2's own footnote: "no grammar wiring into the `aspect <number>` sizing key this wave" — confirmed empirically, not merely quoted). | Not touched — grammar cannot carry this relation yet. |

**The "both-664s" finding, in full.** Row 2403 predicted the honest
derivation would leave the settings tab's `pack-rows` result (~443)
as T's binding child, "far narrower" than 664. Empirical
verification (bisecting the actual value against `compiler.py` via
CP-SAT, not assumed) shows this prediction does not survive contact
with `AT_multires`' own fixed 580px height: `compiler.py`'s
`_constrain` gives every Exclusive/T child the SAME shared rectangle
on BOTH axes (`model.Add(sv.w[cpath] == w); model.Add(sv.h[cpath] ==
h)`), so a leaf several levels down (`AT_multires`, inside
`ANALYSIS TABS` T, inside `CP-analysis`'s own V) that needs `h >=
580` propagates that requirement all the way up through the
recursive `_constrain` chain to the OUTER T's own shared `h`,
independent of what any node's own DECLARED `min` field says.
Lowering the outer T's pin to 443 (matching a shallow
`max-over(children.min)` over the FLAT declared mins) therefore
collides with this recursive constraint and the whole program goes
INFEASIBLE — verified directly: 663px fails, 664px succeeds, 700px
succeeds (a floor, not an exact-equality point). `CP-analysis`'s own
honest floor, once the AT_multires cascade is accounted for
(`80px timelineStrip + 4px gap + 580px AT_multires = 664px`), turns
out to equal the outer pin exactly — not a coincidence and not a
duplication bug, but two independently-computed numbers that are
honestly equal because `CP-analysis` is the binding child. The
DELIVERABLE of task 2 (retiring the hand-typed literal in favor of a
computed relation) is fully achieved; the NUMBER itself does not
move. This is reported here rather than silently reverted, per the
"model changes are PRESENTED" instruction — even a "no-op" value
outcome is a finding worth surfacing, since it corrects a prediction
already on the ledger.

---

## 3. Redesigns (spec §3's "a construct needing a comment is wrong")

1. **`boardRail` (§3(a), spec's own worked example).** Delivered as
   specified — `{fixed width-of(...)}` in the spec's prose becomes
   `{pinned width-of(...)}` in the REAL grammar (`pinned` is
   dispatch B's actual keyword; the spec's prose used "fixed" as
   informal shorthand, not the literal keyword). **Not reachable
   against real facts** — no `facts.generated.json`/`facts.residue.json`
   entry exists for `boardRail` (its only entry is `unexercised: true`,
   the release-toggle-off cold-boot state) — stays a bare `{168px}`
   literal, disclosed rather than silently left unexplained.

2. **The control-panel `T(...)` pin (§3(b)).** Delivered exactly as
   specified: `@demote(h sum-of(max-over(children.min), tree.min,
   gap)) {pinned max-over(children.min)} T(...)`. See §2's "both-664s
   finding" for why the resulting number is unchanged.

3. **`settingsSubstrip` / the settings T-child (§3(c)).** Delivered
   exactly as specified: `pack-rows(items: [...], target-rows: 2,
   search-ceiling: 838px)`, verified against `flow.py`'s own
   `narrowest_width_for_row_count` directly (443.0, byte-for-byte).
   The `items` list stays six LITERAL px values (113/177/153/153/
   137/105) rather than `text-width-of(...)` relations, because
   `text-width-of` has **zero facts-table coverage** anywhere in the
   committed `facts.generated.json`/`facts.residue.json` (confirmed
   by enumerating every entry's `method` field: only
   `read-constant`/`playwright-boundingBox` appear, never
   `text-width-of`) — using the primitive itself (as the census names
   it) is the real deliverable; grounding its six operands in genuine
   text-measurement facts is a separate, unstarted wave.

4. **A new redesign not named by the spec's three worked fragments:
   `CP-analysis`'s own V-wrapper floor.** No primitive in the current
   grammar lets a plain (non-Exclusive) Split reference its own
   children's real, recursively-derived requirement the way
   `max-over(children.min)` does for an Exclusive/T node — the
   grammar's sibling/child-reference primitives (`sum-of`/`max-over`'s
   general form) only reach an ENCLOSING split's own already-loaded
   SIBLINGS, never a node's own descendants two levels down. The
   honest arithmetic (`timelineStrip`'s own fixed 80px height + the
   wrapper's own 4px gap + `AT_multires`' real 580px height) is
   therefore expressed as `sum-of(80px, 4px, read-constant(AT_multires))`
   — TWO of the three operands are still literals (`80px`, `4px`),
   because no facts entry exists for `timelineStrip`'s own height and
   the `gap` keyword resolves against the ENCLOSING split (here, the
   BLACK BOX T, which has no gap), not the CURRENT node's own declared
   gap (confirmed by direct refusal: `'gap' referenced ... but the
   enclosing split declares no gap`) — a genuinely different
   resolution rule from what the test suite's own examples exercise.
   This is reported as a language-substrate gap for a future wave
   (§6), not silently worked around.

---

## 4. Substrate bugs found and fixed during this dispatch

Two genuine bugs in the language substrate (not census/spec
misreadings) surfaced only because C3 exercised combinations the
substrate had never actually carried before:

1. **`loader.py`'s fixed/pinned-shorthand branch dropped `aspect`
   entirely.** `_load_sizing`'s general (non-fixed) branch returns
   `ast.Sizing(..., aspect=rs.aspect, ...)`; the fixed/pinned-shorthand
   branch's own `return ast.Sizing(...)` never included `aspect=` at
   all — any leaf combining `pinned`/bare-`{Npx}` shorthand with
   `aspect N` silently lost the aspect declaration. Surfaced by this
   dispatch's own `previewBoard[common, info]{pinned
   read-constant(previewBoard, portrait), aspect 1}` (portrait) —
   confirmed via direct inspection of the loaded `Sizing.aspect`
   field (`None` before the fix, `1.0` after), and via the regenerated
   `.gen.ts` diff (`aspect: 1 -> aspect: null` before the fix, gone
   after). **Fixed** in `loader.py` (one-line addition,
   `aspect=rs.aspect`), regenerated `.gen.ts` files confirm the fix.
   Pre-existing bug — dispatch B's own `pinned` keyword had never
   before been combined with `aspect` by any encoding.

2. **The `envelope` mechanism's consistency check (`pref` must equal
   the computed `max-over` of declared states) is structurally
   incompatible with `emit_layout_tree.py`'s track-emitter vocabulary
   for a "floor-free, capped-growth" shape.** Discovered while trying
   to give `A_engine_eval`/`A_engine_health` a real `min`-only
   reservation (no rigid floor) that could still grow via `fr`: the
   envelope check refuses `pref: 1fr` outright once any per-state
   extent is declared (`"the slot's own 'pref' is 1fr — the declared
   reservation must equal what the declared states justify"`), and
   the emitter's own closed vocabulary
   (`_track_shape_for_child`) has no shape for "capped, non-fr pref,
   no floor" either. Not a bug to fix (both checks are individually
   correct and load-bearing) — the two constraints together mean
   `pinned` (full fixed reservation) is the ONLY reachable spelling
   for a leaf-level envelope this wave. Documented rather than
   silently routed around; the resulting real floor is what caused
   the disclosed feasibility flip in §2/§5.

---

## 5. Two pre-existing tests updated for disclosed model-change consequences

Both updates are individually justified in the test file itself
(not a bare assertion flip) and match this exact test suite's own
established pattern of updating `known_infeasible_by_valuation`-style
sets as real model changes land (its own docstring already documents
five prior such updates across the P1/Option-C/W4 arcs):

- `tests/test_lyt.py::test_generated_pages_embed_valid_overlay_json_matching_overlay_sizes`
  — added `("default", "portrait", "420x880")` to
  `known_infeasible_by_valuation`, with an inline comment naming the
  exact cause (the new ~139px `A_engine_eval`/`A_engine_health` floor
  now exceeds this narrowest portrait viewport's available row
  width).
- `tests/test_emit_layout_tree.py::test_p2d_portrait_tree_orientation_matches_independent_derivation`
  — removed `"420x880"` from the expected unanimous-vote set for the
  same reason (that size no longer solves under `default` valuation,
  so it contributes no orientation vote); the remaining four sizes
  still agree unanimously, so the function under test is otherwise
  unaffected.
- `tests/test_emit_layout_tree.py::test_f1_port_envelope_states_null_for_every_leaf_this_wave`
  renamed to `..._except_the_i_engine_pair` and updated to assert
  `envelopeStates is not None` for exactly `A_engine_eval`/
  `A_engine_health`, null for every other leaf — this test's own
  premise (every leaf's envelope is null "this wave") was written
  against dispatch B's state and is now correctly falsified by C3's
  own deliverable.

No other test in the 421-test suite required updating.

---

## 6. Purge-accounting table

Cross-checked against dispatch A's own relocation itemization
(`.claude/dispatch-reports/lyt-relations-a-relocation-probe.md` §1)
as the authority, per the brief. Every category A already itemized
is covered by A's own table and needed no further action here;
this table covers only what changed BECAUSE of C3's own rewrite —
the act of deleting ~1400 comment lines and writing fresh files, not
a re-litigation of A's relocation work.

| Comment content purged (this dispatch's own deletion) | Already homed by A? | Action taken |
|---|---|---|
| All per-node grounding derivations (measurement waves, ceiling arithmetic, wrap-breakpoint math) | Yes — A's own table routes these to `facts.generated.json`/`facts.residue.json`'s provenance fields | Nothing further; the facts files were read, not re-derived, confirming A's relocation actually holds the content this dispatch needed. |
| Ledger row citations / dispatch-report references throughout both files | Yes — canonically the ledger + `.claude/dispatch-reports/*.md` | Nothing further. |
| BOTH-AXES TENSION / L13-L16 cascade / aspect-cross-fill disclosures | Yes — SPEC.md §12/§16.2 per A's own audit | Nothing further; this dispatch's own empirical finding (§2's "both-664s") is a NEW instance of exactly this tension (CP-analysis's own min conflating a width-relevant and a height-relevant number into one field) — not re-homed here, but named in this report as the evidence base. |
| `340px+60ch` cap's undocumented `340px` component; the un-authored `A_engine_eval`/`health`/`queue` width floors | Yes — SPEC-AMENDMENTS.md "Residual items" R1/R2 per A's own table | Nothing further; this dispatch's own `A_engine_eval`/`health` rewrite (§2) is a DIFFERENT, narrower fix (the five connected-latency facts, not the hand-derived ~236/276px per-group floors A's own item names) — `A_engine_queue`'s own floor stays entirely un-derived, matching A's disclosure, not silently closed here. |
| CP-analysis's own "the analysis tab's own hand-typed min 664px" derivation prose | New — not itemized by A (this literal's OWN comment lived in the encoding, describing the SAME 664 the outer T pin ALSO carried, and A's own itemization did not single this comment out separately from the outer pin's) | This report's §2 IS its durable home now — the finding that both stay 664 for genuinely independent reasons is recorded here, not left to vanish with the deleted comment. |

**STOP-and-report check (per the brief's own instruction):** no
load-bearing, homeless content was found. Every comment purged
either already had a home per A's own audit, or (the CP-analysis
"honest floor" derivation, and this dispatch's own new findings —
both-664s, the two substrate bugs, the language-substrate gap named
in redesign §3.4) is recorded durably in THIS report, which is
itself the durable home the brief's own deliverable instruction
names.

---

## 7. Gates — commands and exit codes

```
$ cd research/lyt && /tmp/lyt-venv-c3/bin/pytest tests/ -q
421 passed, 11745 warnings in 5.46s
$ echo $?
0
```

Pre-dispatch baseline (same venv, same command, HEAD before any
edit): 421 passed, 15639 warnings, exit 0 — matching ledger row
2425's own witnessed figure exactly, confirming the venv/harness is
faithful.

**Deprecation-warning count for the two encodings specifically**
(building `LYT_LANDSCAPE`/`LYT_PORTRAIT` in isolation, not the whole
suite): **119 total** (61 landscape + 58 portrait), down from 528
pre-dispatch (261 + 267 read off the pre-dispatch build) — a **77.5%
reduction**, not literally zero. The residual 119 split evenly:
- **~60 are bare `1fr`/`inf`/`0px` structural sizing keywords** —
  every `pref 1fr` and `max inf` in the tree ALSO fires the same
  deprecation channel (`RelationsFirstDeprecationWarning` fires on
  ANY literal binding, not only px "design decisions"), and neither
  has a relations-first analog to convert to — this is inherent to
  the language's own literal-vs-relation distinction, not a residual
  gap in this dispatch's coverage.
- **~59 are px/ch literals genuinely unreachable against the
  committed facts files**, enumerated exhaustively (both files,
  every site, no silent omissions): `boardRail` (168, both
  classes — its only facts entry is `unexercised: true`),
  `I_board`/`A_board` (24/28, both classes — census's own
  UNEXERCISED flag, no facts entry), `A_engine_*` row's own `80px`
  height (no v-axis facts entry exists for `A_engine_controls`, only
  h-axis/width entries — see §3.4's language-substrate gap for why
  this couldn't be derived either), `tree`'s landscape floor (110 —
  disclosed solver-only relaxation, deliberately not a live read),
  `settingsSubstrip` (77, both classes), the `pack-rows` six item
  widths (113/177/153/153/137/105, both classes — `text-width-of`
  has zero facts coverage), `timelineStrip` (80, both classes),
  three inner analysis-column `V` mins (160/200 ×3, both classes —
  not one of the two named-664 sites, deliberately untouched per
  narrow-scope discipline), `otherColorDebug` (264, both classes),
  `otherBand`'s enclosing V's own 204 (both classes — same untouched-
  scope reasoning as CP-other in §2/§6), `previewBoard`'s landscape
  figure (160 — no facts entry), the side-column's own 345px width
  floor (landscape — no facts entry), and `60ch` (the side-column
  cap's ch component — `PX_PER_CH` stays compiler-internal per
  ruling 2400(3), so `ch` literals are not in scope for retirement
  this wave), and one root-level `0px` per file (the outer split's
  own trivial floor, never enumerated by the census as a design
  decision).

**`.gen.ts` regeneration** (`python emit_layout_tree.py --registration
landscape` / `--registration portrait`, exit 0 both): the diff
contains EXACTLY the changes predicted in §2's table (A_app's two
values, A_engine_eval/health's track shape + envelopeStates) —
verified via `git diff --stat` (10 lines changed per file) and full
`git diff` inspection, matched line-by-line against the model-change
table before this report was written.

**Frontend roundtrip check**
(`tests/test_emit_layout_tree.py::test_render_ts_roundtrip_matches_
committed_file` / `test_portrait_render_ts_roundtrip_matches_
committed_file`) — part of the 421-test pytest run above, both
PASS post-regeneration (byte-identical to the committed `.gen.ts`
files). **`frontend/scripts/lyt-conformance.mjs`** was located
(exists, is the browser-based DOM-vs-solved-geometry diff harness
named by the dispatch brief) but **UNEXERCISED** — it requires a
built SPA served on a scratch port plus a live Chromium instance,
both explicitly forbidden by this dispatch's own discipline ("no
browsers or rigs needed — do not start any"); the Python-side
roundtrip gate above is the check actually within scope, and both
its two tests pass.

**Full-tree solver sanity** (`runner.run_all(time_limit_s=30)`,
covering all five registered encodings at all four
`SCREEN_SIZES`): landscape/portrait's own OPTIMAL/OPTIMAL/
INFEASIBLE/OPTIMAL pattern is byte-for-byte identical to the
pre-dispatch baseline (both captured via the same command before
and after the rewrite) — the pre-existing 1280×1024 landscape
INFEASIBLE point is unrelated to this dispatch (present before any
edit) and untouched.

---

## 8. Refusal-default flip

**Not performed**, per explicit scope exclusion ("Do NOT flip the
refusal default — that is C4").

---

## 9. Claims summary

- Base freshness check: WITNESSED (rebase performed, both prereqs
  confirmed present).
- Both dispatch reports cited present in worktree: WITNESSED.
- Census §1/§3 + grammar-by-example + facts files read end to end:
  WITNESSED.
- Both encodings rewritten relations-first, zero comments: WITNESSED
  (full listings in §1, `grep -c -- '--'` returns 0 for both files).
- Both-664s finding (number unchanged, representation improved):
  WITNESSED (CP-SAT bisection, 663px fails / 664px succeeds,
  reproduced independently against both the outer-T-only and
  outer-T+CP-analysis-only isolated variants).
- I_engine envelope wiring: WITNESSED (five real facts, `pinned`
  after `min`-only and `pref+max-cap` alternatives were both proven
  unreachable given the substrate's own real constraints).
- A_app worst-case-state resolution: WITNESSED (28px landscape, 56px
  portrait, both read off the loaded `Sizing` directly).
- Two substrate bugs found and fixed: WITNESSED (`loader.py`'s
  `aspect` drop, confirmed via before/after `Sizing.aspect` and
  `.gen.ts` diff; the envelope/emitter incompatibility, confirmed via
  direct refusal messages from both mechanisms).
- `.gen.ts` diff matches prediction exactly: WITNESSED (line-by-line
  comparison against §2's table).
- Full pytest gate: WITNESSED, 421 passed / exit 0.
- Deprecation-warning collapse (528 -> 119, both files): WITNESSED,
  every residual entry enumerated in §7, none silently dropped.
- `lyt-conformance.mjs` roundtrip: UNEXERCISED (browser required,
  forbidden by dispatch discipline) — disclosed, not silently
  skipped.
- Refusal-default flip: correctly REFUSED-AS-EXPECTED (out of scope
  for C3, reserved for C4).
