# ADR-0019 audit closeout — consolidated report

Work item: `adr19-audit-closeout` (row 771, claimed row 772/1209). Reconciliation finding
that triggered this write: "only an interim status was ever reported; no consolidated
report exists" (`stale-claims-reconciliation.md`, row 1145's disposition table, item
`adr19-audit-closeout` itself scored GENUINELY-OPEN for exactly that reason). This report
supersedes the interim status given at row 773 ("S1 fixed, S2 residual, S4 partial,
S3/S14/S16 open, rest pending sweep") with a full S1–S17 sweep.

**Sources.** `./autoharn led --recent 20000` (1206 lines dumped, grepped for `adr19`, each
`S<n>` token, and item slugs); `git log --oneline --all --grep=` per S-number and per slug;
`git merge-base --is-ancestor <sha> next` to confirm every cited commit is actually reachable
from the current tip, not a stale worktree branch; `.claude/dispatch-reports/adr19-audit.md`
(the source audit, 17 findings S1–S17, Opus, 2026-08-06); `.claude/dispatch-reports/
stale-claims-reconciliation.md` (row 1117 commissioner-directed audit, row 1134 published,
row 1145 commissioner adjudication); `.claude/dispatch-reports/s6-s11-s13-tabrail.md`,
`s14-s16-dialogs.md`, and their `-review.md` companions.

**Witness key.** WITNESSED = sha and/or ledger row cited and checked; UNEXERCISED = no
work item and no commit found, blocker named.

---

## Per-finding status table

| # | Finding (severity) | Ruled | Shipped (commit, WITNESSED) | Status |
|---|---|---|---|---|
| S1 | CRITICAL — cold load paints a phantom 37-board workspace, no loading state, silent swap to the real 92 | Fired in the S1–S6 build wave (row 230/231); commissioner-closed at reconciliation (row 1145: "CLOSE — condition VERIFIED: `tests/integration/workspace-load-gate.test.ts` exists") | `6d83b297` fix + `d1e35098` nit fix + `7de45fcb` "Merge cold-load truthfulness gate (ACCEPT-WITH-NITS)" — WITNESSED ancestor-of-`next` | **CLOSED (shipped)** |
| S2 | CRITICAL — resizer resizes neither neighbour, dual-slot writes, drag-start clobber, wrong slot persisted | Fired as `resizer-rearchitecture` (row 235); amended mid-build to a nested-splitter architecture per commissioner diagnosis (row 391) | `94eab0f1` feat + `2f3b709f` "Merge resizer re-architecture: nested splitters, resizable tree pane, continuity + no-auto-resize witnesses (ACCEPT after repairs)" — WITNESSED ancestor-of-`next`. Builder self-disclosed two residuals at delivery (row 459): 41px inner-bar lag un-root-caused, Library/Analysis breakpoints left unconverted — neither residual has its own ledger item since | `resizer-rearchitecture` work item **CLOSED (shipped, row 565)**; two disclosed residuals never separately tracked |
| S3 | CRITICAL — `moveFilterThreshold` has 3 editable homes + 1 mirror; class is 12-wide (Rule 3's own minting specimen) | "Dual-home migration" was repeatedly offered to the commissioner as a one-word option (rows 890, 892, 954, 969, 978, 998) and never selected — no adjudication answer on record after row 210 | No commit, no work item ever opened for a Rule-3 dedup gate or a home-count reduction | **OPEN — UNEXERCISED** (blocker: commissioner never picked "dual-home" off the standing options list) |
| S4 | HIGH — default `cluster` theme fails WCAG on 66/116 light-mode text nodes by construction | Fired as `ui-contrast-text-tokens` (row 216); first build (row 253) got a review REJECT (row 264: canonical anchor missed JS-side chart-color consumers, breaking data-series-untouched); repaired (`bd58cdd7`) and re-reviewed ACCEPT | `29de3681` feat + `bd58cdd7` repair + `56a3d7e3` "Merge opt-in high-contrast text tokens (ACCEPT re-review)" — WITNESSED ancestor-of-`next`. Commissioner sign-off row 308: "high-contrast text toggle tested, 'quite nice actually'" | **CLOSED (shipped, row 899)** — ships as an opt-in flag, default OFF; the shipped-default `cluster` theme itself still fails WCAG unless the operator turns the toggle on |
| S5 | HIGH — all 7 modals keyboard-inert (no focus entry, Escape does nothing, Tab walks the page behind) | Fired as `audit-modal-keyboard` (row 233); commissioner-closed at reconciliation (row 1145: "done") | `92be2104` "shared keyboard/focus mechanism for all 7 modals (ADR-0019 S5)" — WITNESSED ancestor-of-`next` | **CLOSED (shipped)** |
| S6 | HIGH — board close is irreversible/unconfirmed/16×16/only-keyboard-reachable-thing in the tab rail | Fired in the S6/S11/S13/S14/S16 commission (row 779); first build returned on a stale worktree base and was resumed with a repair brief (row 801); merged after fresh-context review | `5aa860f5` fix + `8e17f5d6` "Merge S6+S11+S13: tab-rail keyboard operability, close guard, accessible names, toolbar-btn bg (ACCEPT)" — WITNESSED ancestor-of-`next` | **CLOSED (shipped, row 1194)** |
| S7 | HIGH — no move-navigation cluster (first/prev/next/last) anywhere in the toolbar | Commissioner ruling row 926: "S7 rides with roadmap Phase 3" — folded into `res-phase3-density-s7` rather than its own item | `ba30d268` "toolbar clusters + genre move-nav cluster (audit R4, S7 rider)" + `4c47c48f` "Phase 3 — measure tokens, toolbar clusters + move-nav (S7), tree fraction default" — WITNESSED ancestor-of-`next`; test-witness gap on stored-drag-precedence closed separately (row 1061→ property tests added) | **CLOSED (shipped, row 1064)** |
| S8 | HIGH — Analysis charts render full axes/legends over zero data, no empty state | Never selected off any adjudication list; no ledger row proposes an item for it | No work item, no commit | **OPEN — UNEXERCISED** |
| S9 | MEDIUM — Settings is a raw model dump: 145 unlabelled inputs, label-to-control distance up to 1315px, storage UUIDs as headings, a zombie `controlPanelWidth` field, no preferences surface | Only the "collapsible headings" bullet was separately commissioned (`registry-collapsibles`, row 237) | `ddf014b1` "collapsible headings in Advanced Registry, knobs/analysis_env default-collapsed" + `92253af9` merge — WITNESSED ancestor-of-`next`, closed (row 1186). Labeling (`<label for>`), the 1315px distance, the `controlPanelWidth` zombie field, and the missing preferences surface have no work item or commit | **PARTIAL** — one of five named sub-defects shipped; the rest are OPEN — UNEXERCISED |
| S10 | MEDIUM — layout doesn't use the screen: 96:1 slider, 1229px button, 85%-empty toolbar, 12px max text at 3840px width | Fired as `layout-slack-to-panel` (row 849); merged and reviewed ACCEPT | `76acb225` fix + `b4ae45e5` "Merge layout slack-to-panel: board column yields height-bound slack; SGF buttons stacked (ACCEPT)" — WITNESSED ancestor-of-`next`. But the commissioner's own live retest at reconciliation (row 1122, row 1145) read it as "not-sure-but-probably-not?" — the merged fix did not visibly resolve the complaint for him | **PARTIAL / disputed** — shipped per the ledger, STAY-OPEN per the commissioner's own live retest (row 1145) |
| S11 | MEDIUM — every board tab reads "Board" (CSS-counter numbering, invisible to DOM/AT/find-in-page); positional not identity-stable; never takes the loaded game's name | Fired in the S6/S11/S13/S14/S16 commission (row 782); same build/merge as S6/S13 | `5aa860f5` fix + `8e17f5d6` merge — WITNESSED ancestor-of-`next` | **CLOSED (shipped, row 1190)** |
| S12a | MEDIUM (half) — sibling variations distinguished by hue-only rings; audit recommended flipping the default to `letters` | Commissioner adjudication row 776: **REJECTED** — "circles IS the ADR-0019-compliant, genre-conventional rendering; letters is the odd-one-out." Struck from the pre-publish backlog | No commit needed — ruled not-a-defect | **STRUCK** (commissioner overruled the audit's recommendation; current `circles` default stays by design, not by omission) |
| S12b | MEDIUM (half) — `reviewState` (ACTIVE/INTERMISSION/COMPLETE) carried by tab-border hue alone, no glyph/label/shape | Row 776 explicitly carves this out: "S12b ... not covered by this ruling, remains open pending adjudication" | No commit, no work item, no later adjudication row found | **OPEN — UNEXERCISED** (blocked on a commissioner ruling that was never revisited after row 776) |
| S13 | MEDIUM — `.toolbar-btn-sm` has no background in dark theme, leaks Chromium `ButtonFace` behind SAVE/PURGE | Fired in the S6/S11/S13/S14/S16 commission (row 784); same build/merge as S6/S11 | `5aa860f5` fix + `8e17f5d6` merge — WITNESSED ancestor-of-`next` | **CLOSED (shipped, row 1192)** |
| S14 | LOW — 17 native `prompt()`/`confirm()`/`alert()` sites, 7 duplicate `.modal-backdrop` blocks, ~100 undeclared hex literals | Fired as `s14-native-prompts` (row 786), paired with S16 as one build; C20 label gap found and fixed post-merge | `951742fc` "sanctioned in-app dialogs replace 17 native prompt/confirm/alert calls (ADR-0019 S14/S16)" + `e530bc86` "give AppPromptDialog's input a real programmatic label (C20)" + `197320ce` merge — WITNESSED ancestor-of-`next`. Reconciliation (row 1145) confirms "S14's own ask is fully covered" by code, but the item itself is held **STAY OPEN** ("not sure, I only read english") pending a locale/i18n check of the new dialog copy — that check is the read-only `s14-native-prompts` dispatch claimed alongside this report (row 1211/3) | **PARTIAL — code shipped, item OPEN pending locale verification** |
| S15 | LOW — `GET .../qeubo/experiment/status` returns 503 on every cold load, surfaced nowhere (no toast, no log panel, no body text) | Never selected off any adjudication list; only referenced in passing as a caveat about a dev-restart's default env (row 378) | No work item, no commit | **OPEN — UNEXERCISED** |
| S16 | LOW — shipped tombstone text in the Analysis tab ("Moved to Other tab → Knob Registry...") standing in for a removed control | Fired as `s16-tombstone` (row 788, "Remove shipped Move Filter tombstone section") alongside S14; the S14+S16 *merge commit message* (`197320ce`) says "tombstone removed" but that refers to unrelated native-dialog code — the reconciliation audit (row 1134) caught this as a false positive and verified the stub is **still present verbatim** in `AnalysisControls.vue:250-260`. Commissioner then ruled directly on the item (row 1131): *"let's close it. I like the move filter visibility for now... it's no great annoyance regardless"* — the removal commission is withdrawn, the stub **stays** by preference | No code change to the Move Filter section exists on `next` (checked directly against `AnalysisControls.vue`, reconciliation report) | **CLOSED — dropped** (row 1133; not fixed, closed because the commissioner decided the finding's own recommendation was wrong for this case — same disposition class as S12a, reached by a different route: reconciliation catch → direct ruling, not audit-time triage) |
| S17 | LOW — Cards tab "CONTEXT IDS" renders an association as a raw comma-separated free-text input over opaque primary keys, instead of a multi-select over named entities | Never commissioned as this defect. A related but distinct problem (the `${gameSourceId}` macro's resolution path breaking after the browse-leak-fix removed raw PKs from the wire) was fixed by `macro-public-id-tokens` (row 500) — that item restores macro *resolution*, it does not turn the free-text input into the multi-select S17 asks for | `macro-public-id-tokens` merged (widens `/forests/query`) but does not touch the input's own control type; no commit changes `CONTEXT IDS` from free text to a selection widget | **OPEN — UNEXERCISED** (the adjacent macro-plumbing fix is sometimes mistakable for this finding's discharge; it is not — same false-positive-adjacent-fix shape the reconciliation flagged for S16) |

---

## Open remainder list

Findings still requiring commissioner action or build work, in the audit's own severity order:

1. **S3** (CRITICAL) — Rule 3 dual-home dedup for `moveFilterThreshold` and its 11 siblings. Blocked purely on a commissioner yes/no that has been on the standing options list since row 210 and never answered.
2. **S8** (HIGH) — Analysis charts need a `RemoteData`-style empty state instead of full axes over zero series. Never dispatched.
3. **S9** (MEDIUM) — Settings/registry labeling (`<label for>`), label-to-control proximity, the dead `controlPanelWidth` field, and a real preferences surface. Only the collapsible-headings slice shipped.
4. **S10** (MEDIUM) — commissioner's own retest says the layout-slack fix did not resolve his experience of it; needs a live re-look, not necessarily new code.
5. **S12b** (MEDIUM) — review-state tab-border hue needs a redundant non-color channel (glyph/shape). Carved out of the S12a ruling and never revisited.
6. **S14** (LOW, code done) — locale/i18n check of the new dialog copy; in flight as of this report (row 1211).
7. **S15** (LOW) — surface the qEUBO 503 to the operator (toast or status-bar indicator) instead of console-only.
8. **S17** (LOW) — replace the Cards-tab free-text context-id input with a multi-select over named entities.

Findings **closed by ruling rather than by fix** (worth keeping distinct from "shipped" in any future count): **S12a** (struck — audit's recommendation rejected, current behavior is correct) and **S16** (dropped — audit's recommendation rejected after a false-positive scare, stub stays by preference).

---

## Row / sha counts

- **Ledger rows read:** 1206 (full `led --recent 20000` dump); ~90 rows directly cited above after `adr19|S<n>|<slug>` grep-narrowing.
- **Commits cited and WITNESSED as ancestor-of-`next`:** 17 distinct shas (`6d83b297`, `d1e35098`, `7de45fcb`, `94eab0f1`, `2f3b709f`, `29de3681`, `bd58cdd7`, `56a3d7e3`, `92be2104`, `5aa860f5`, `8e17f5d6`, `ba30d268`, `4c47c48f`, `ddf014b1`, `92253af9`, `76acb225`, `b4ae45e5`, `951742fc`, `e530bc86`, `197320ce` — 20 total, each checked with `git merge-base --is-ancestor`).
- **Findings:** 17 total (S1–S17, S12 split into S12a/S12b per row 776 = 18 tracked units). **9 CLOSED shipped** (S1, S2, S4, S5, S6, S7, S11, S13), **2 CLOSED by ruling, not fix** (S12a struck, S16 dropped), **1 PARTIAL-code/OPEN-item** (S14), **2 PARTIAL** (S9, S10), **5 OPEN/UNEXERCISED** (S3, S8, S12b, S15, S17).

No files outside this report were modified. No live service was touched.
