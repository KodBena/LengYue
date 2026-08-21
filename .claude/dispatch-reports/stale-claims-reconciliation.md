# Stale-claims reconciliation — per-item disposition (READ-ONLY audit)

Commissioner directive 2026-08-09 (ledger row 1117): for every open+claimed work item, read its
opening-row text, gather evidence from the repo (git log, merged code, ledger rows) of whether
its deliverable actually shipped, and produce a per-item disposition table. No closes performed —
this table is for commissioner adjudication only.

Method: for each slug, the opening `work_opened` row text was pulled verbatim from the ledger
(`led --recent 20000 --fields id,kind,statement`, 1112 rows dumped and grepped locally), then
cross-referenced against `git log --all --grep=<keywords>` and `git merge-base --is-ancestor
<sha> next` to confirm the candidate commit is actually reachable from the current branch tip
(not just committed somewhere in a stale worktree branch).

**Counts (of 43 total open+claimed items): 37 BELIEVED-SHIPPED, 0 UNCLEAR, 6 GENUINELY-OPEN**
(`adr19-audit-closeout`, `mech-graph-hydration-multitask`, `s16-tombstone`, plus the three the
commissioner pre-declared as excluded/in-flight: `lib-repair-open-interaction`,
`tabwidget-space-doublefire`, `wheel-hover-gate-purity`).

## s16-tombstone — verbatim opening text and what it actually asked

> `work_opened: s16-tombstone -- Remove shipped Move Filter tombstone section from Analysis tab`

Context (commission row 779): "Act on ADR-0019 findings S6, S11, S13, S14, S16 ... S16 confirmed
by orchestrator as user-visible tombstone text in Analysis tab, removal approved on that reading."

This refers to `AnalysisControls.vue`'s move-filter-box: commit `c1cb50d4` (2026-05-14) replaced
the working slider with a **transitional stub** ("relocation notice") pointing users at the
registry-driven slider that duplicated it, explicitly framed as an interim state ("the eventual
home is a toolbar-hover quick-access surface... this transitional state is honest about itself").
The stub is still present verbatim in the current tree
(`frontend/src/components/editors/AnalysisControls.vue:250-260`, a read-only value-badge with a
comment citing "ADR-0019 S3/S16"). **s16 was never delivered** — the section it asks to remove is
still there. The *separate* S14/S16 merge (`197320ce`) that also uses the word "tombstone" in its
commit message is about native-prompt dialogs (unrelated code, unrelated meaning of "tombstone")
— exactly the false-positive symptom the commissioner warned against inferring from.

## Disposition table

| slug | what it commissioned (from its own row text) | evidence found | verdict |
|---|---|---|---|
| audit-cold-load-gate | "Cold-load truthfulness gate: the app must not paint an interactive workspace with wrong boards; a load-state gate per C6/C7" | Merge `7de45fcb` "Merge cold-load truthfulness gate (ACCEPT-WITH-NITS...)" — ancestor of `next` | BELIEVED-SHIPPED |
| audit-modal-keyboard | "Modal keyboard integrity: all seven modals get Escape-dismiss and focus containment per C17" | `92be2104` "shared keyboard/focus mechanism for all 7 modals (ADR-0019 S5)" — ancestor of `next` | BELIEVED-SHIPPED |
| batch-mint-endpoint | "Backend: transactional POST /cards/batch per ratified contract" | `eb868a58` feat + `0f613e63` "Merge transactional batch mint... (ACCEPT-WITH-NITS)" — ancestor of `next` | BELIEVED-SHIPPED |
| docker-calibration-resource | "visit_distribution.json ships in the docker image: relocate static resources out of mutable data dir" | `961e1d7c` "relocate visit_distribution.json out of the gitignored/dockerignored data dir" + `1fd4536c` — ancestor of `next` | BELIEVED-SHIPPED |
| engine-ws-shim | "Clean minimal websocket shim wrapping a local KataGo analysis process (from ~/g.py)" | `859637dc` "Merge engine websocket shim: cleaned irreducible-minimum from g.py prototype (commission row 820)" — ancestor of `next` | BELIEVED-SHIPPED |
| first-run-small-viewport | "First-run layout defaults fit the actual viewport: no right-edge clipping of control panel at ~1920px" | `67671f84` "Merge first-run viewport floor... (commission row 802)" — ancestor of `next` | BELIEVED-SHIPPED |
| hotkeys-batch | "Four new hotkeys via existing keybindings catalog: swap engine, cycle engine, mint card, next card, toggle main-line variation" | `c298a9e5` "Merge hotkeys batch (ACCEPT-WITH-NITS + nit fixes...)" — ancestor of `next` | BELIEVED-SHIPPED |
| kataproxy-docker | "KataProxy (fable-branch) service in the docker stack: cache 8192, transposition detector on, upstream engine WS via env, docs" | `e2e860d6` "Merge KataProxy docker service... (commission row 820)" — ancestor of `next` | BELIEVED-SHIPPED |
| kataproxy-tauri | "KataProxy (fable-branch) delivered with the tauri package: same defaults, upstream WS asked at setup" | `a0c2ce8a` "Merge KataProxy Tauri sidecar... (ACCEPT-WITH-NITS)"; corrected witness row 859 confirms cargo check green post-repair — ancestor of `next` | BELIEVED-SHIPPED |
| known-positions-boot-hydrate | "Bulk (content_hash,card_id) endpoint + auth-gated boot hydrate so tree known-card rings populate at SPA start" | `91b5d557` feat + `f727f0b3` "Merge known-positions boot hydrate... (ACCEPT-WITH-NITS, findings repaired)" — ancestor of `next` | BELIEVED-SHIPPED |
| layout-slack-to-panel | "Board column yields unused width to control panel; SGF buttons stacked; rail minimal" | `b4ae45e5` "Merge layout slack-to-panel: board column yields height-bound slack; SGF buttons stacked (ACCEPT)" — ancestor of `next` | BELIEVED-SHIPPED |
| learn-path-any-position | "Learn Path works from any board position: anchor = existing card or freshly minted anchor card" | `392f1e09` "Merge Learn Path any-position: anchor = existing card at cursor or fresh mint (ACCEPT-WITH-NITS)" — ancestor of `next` | BELIEVED-SHIPPED |
| learn-path-drives-engine | "Learn Path walk queries the engine for unanalyzed positions on demand; real-time growth as results land" | `1edbd051` feat + `6b245edf` "Merge Learn Path drives the engine: on-demand analysis during walk (ACCEPT-WITH-NITS)" — ancestor of `next` | BELIEVED-SHIPPED |
| learn-path-tree-integrity | "Learn Path: explored variations navigable, no node deletion ever, dense tree retained" | `53a1e9a9` fix + `65b0d20a` "Merge Learn Path tree integrity: sibling-state accumulator, guarded navigation, per-step rawKey (ACCEPT)" — ancestor of `next` | BELIEVED-SHIPPED |
| mech-move-ranges-branch-memory | "Mechanics#4: analysis move ranges not remembered when switching branches; key by node's ancestral path" | `f070e4fb` feat + `ade546eb` "Merge branch-stem range memory" (commissioner-adjudicated design, row 112/119) — ancestor of `next` | BELIEVED-SHIPPED |
| mech-rulesets-support | "Mechanics#5: no easy support for KataGo rule sets. Feature-scale" | `800770cf` "Merge rulesets support (ACCEPT, rulesets-leak-batch-review.md; commissioner rulings rows 110/213)" — ancestor of `next` | BELIEVED-SHIPPED |
| mech-sgf-pass-at-end | "Mechanics#1: SGF with a trailing pass breaks the LengYue SGF parser (specimen ~/lost_games/30996027.sgf)" | Real root cause found (row 139: moveless-leaf turn-range off-by-one, not a parser break) and fixed: `3664c887` "derive analyzeTurns from real-move count, not tree index" + `df64f5e5` "Merge analyzeTurns moveless-node fix + ingestion repair (ACCEPT on re-review)" — ancestor of `next`. Directly addresses the specimen's Invalid-turn-number failure mode | BELIEVED-SHIPPED |
| pass-node-color | "Tree pass node renders in the passing player's color, not always-black" | `916e983c` fix + `5f5b18cb` "Merge pass node color fix: pass renders as stone of passing color (commission row 759)" — ancestor of `next` (superseded twice more later by commissioner-directed glyph iterations, still shipped) | BELIEVED-SHIPPED |
| per-user-id-enumeration | "Per-user display enumeration for card/game ids: additive ordinal, backfill migration, ACL surfacing, display-site adoption" | `ddc2dd92` (schema/migration) + `cd5eb73c` (ACL) merged; row 417 "per-user-ids merged to next... schema closed shipped" — ancestor of `next`. Note: row 417 held a *separate* sibling item (`per-user-ids-wire`, not in this list) open for a Browse-tab leak ruling — does not narrow this item's own delivered scope | BELIEVED-SHIPPED |
| per-user-ids-enforcement | "Schema-walk allowlist test + two-tenant cardinality property test" | `e752713e` "test(backend): enforcement -- schema-walk allowlist + cross-tenant property" matches both criteria verbatim; the later-flagged concurrency-race witness (row 417 item 2) was separately closed by `b2e6de10` "Merge Browse-tab non-leak guarantee closure: ...concurrency witness (ACCEPT-WITH-NITS)" — both ancestors of `next` | BELIEVED-SHIPPED |
| port-coherence | "One user-facing port (leaf/shim 1242): docker+tauri upstream defaults converge on it; port-map doc" | `d61de898` "Merge port coherence (docker+SPA): one canonical leaf port 1242, ENGINE_WS_URL the one knob (commission row 864)" — ancestor of `next` | BELIEVED-SHIPPED |
| proxy-setup-instructions | "Setup/wizard + docs instruct the user to provide the upstream engine websocket location" | `f7828c56` "Merge proxy setup instructions: wizard copy, README engine section, wiki note (commission row 820)" — ancestor of `next` | BELIEVED-SHIPPED |
| pv-hint-no-reflow | "PV paste hint must not change layout: board size stable on suggestion hover" | `8d8ed48f` "Merge PV-hint no-reflow: transient hint floats above status bar, board geometry stable (commission row 811)" — ancestor of `next` | BELIEVED-SHIPPED |
| pv-hint-occlusion | "PV hint: no occlusion, no clipping, no reflow — permanent ellipsizing status-bar slot" | `449c998d` "Merge PV-hint in-flow slot: permanent ellipsizing status-bar slot, occlusion/clipping gone (commission row 837)" — ancestor of `next` | BELIEVED-SHIPPED |
| registry-collapsibles | "Advanced registry collapsible headings; knobs and analysis env collapsed by default" | `ddf014b1` "collapsible headings in Advanced Registry, knobs/analysis_env default-collapsed" — ancestor of `next` | BELIEVED-SHIPPED |
| resolution-audit | "Opus multi-resolution appearance audit (no colors), after layout-slack-to-panel" | Deliverable IS the audit report; row 909 "Opus resolution audit returned (resolution-audit.md + 72 assets, R1-R8...)"; `66b5350e` "docs: harvest resolution-audit report" — ancestor of `next`. Item stays open in the ledger because R1-R8 *findings* await commissioner adjudication, not because the audit itself is undelivered | BELIEVED-SHIPPED |
| s11-tab-naming | "Board tab carries accessible name (game name fallback stable id) reaching DOM/AT" | `5aa860f5` fix + `8e17f5d6` "Merge S6+S11+S13: tab-rail keyboard operability, close guard, accessible names, toolbar-btn bg (ACCEPT)" — ancestor of `next` | BELIEVED-SHIPPED |
| s13-toolbar-btn-bg | ".toolbar-btn-sm gets themed background (dark-theme ButtonFace leak)" | Same `8e17f5d6` merge as above | BELIEVED-SHIPPED |
| s14-native-prompts | "Replace 17 native prompt/confirm/alert sites with sanctioned app-modal primitives" | `951742fc` feat + `197320ce` "Merge S14+S16: in-app dialog primitives replace 17 native prompts..." — ancestor of `next`. (Note: this merge's *S16* half was not actually delivered — see s16-tombstone row below; S14's own ask is fully covered) | BELIEVED-SHIPPED |
| s6-board-close-a11y | "Board close gets confirm guard, 24px hit area, focus-visible; tabs keyboard-selectable" | Same `8e17f5d6` merge as s11/s13 | BELIEVED-SHIPPED |
| setup-palette-defects | "(a) toolbar setup affordance NO-OP for everything except handicap; (b) palette OCCLUDES the board" | `4e3b4641` fix + `fc206e0b` "Merge setup-palette defect fixes: board-click routing + in-flow docking (ACCEPT-WITH-NITS)" — ancestor of `next` | BELIEVED-SHIPPED |
| setup-tool-sticky-mode | "Setup tool is a sticky mode per genre convention: no outside-click dismiss at all; explicit deselect only" | `35e7856e` fix + `c649ed1e` "Merge setup-tool sticky mode: outside-click dismiss deleted, explicit ends only (commission row 914)" — ancestor of `next` | BELIEVED-SHIPPED |
| shim-mdns-advertise | "Shim advertises _katago-ws._tcp via optional zeroconf dep; stdlib-only floor preserved" | `ea6c9df6` feat + `a15bcd59` "Merge shim mDNS advertising: optional zeroconf, _katago-ws._tcp, loopback-honest (commission row 869)" — ancestor of `next` | BELIEVED-SHIPPED |
| swz-live-qa-fixes | "Five live-QA defects: collapsed sections, missing theme selector, orange-on-pink contrast, PV-from-current no-op, wizard 1Hz flicker" | `9bdb771f` "fix(frontend): commissioner live-QA batch (commission 748/749)" — ancestor of `next` | BELIEVED-SHIPPED |
| swz-pv-mode-dropdown | "Wizard PV step: mode chosen via dropdown; no auto-cycling" | `05ef687d` "Merge wizard PV mode dropdown: select replaces cycling buttons, auto-advance removed (commission row 795)" — ancestor of `next` | BELIEVED-SHIPPED |
| tauri-upstream-setting | "Tauri: proxy upstream websocket location settable in-app (wizard + settings), persisted, effective on proxy sidecar" | `a5b362a4` feat → REJECTED at review (row 905, two concrete defects) → `86f02fec` repair → `9dd804ef` "Merge Tauri in-app proxy upstream setting (REJECT repaired: infallible launch path, reactive error field)" — ancestor of `next` | BELIEVED-SHIPPED |
| wf11-tauri-linux | "Wanted #11: Tauri desktop distribution, Linux-first... Tauri v2 scaffold, backend URL configurable, Linux bundle targets wired" | `68c00ee5` "feat(dist): Tauri v2 desktop shell with PyInstaller backend sidecar (wf11)" — ancestor of `next` | BELIEVED-SHIPPED |
| adr19-audit-closeout | "Determine per-finding S1-S17 status vs current next, report closure state + remaining backlog to commissioner" | Only an *interim* status was ever reported (row 773: "S1 fixed, S2 residual, S4 partial, S3/S14/S16 open, rest pending sweep"); row 773 itself says "remains: adr19-audit-closeout (consolidated report on sweep return)". No later ledger row or commit delivers the consolidated report | GENUINELY-OPEN |
| mech-graph-hydration-multitask | "Mechanics#9: graphs sometimes fail to hydrate during multi-tasking (Heisenbug); telemetry adequate to reconstruct occurrences, then fix" | Only a narrower *sub-fix* shipped (BaseChart init-retry setTimeout leak, `3df8b233`, explicitly logged at row 186 as "claiming mech-graph-hydration-multitask stays open, this is a sub-fix"); the flight-recorder/telemetry design itself was deferred pending commissioner adjudication (row 119) and never built | GENUINELY-OPEN |
| s16-tombstone | "Remove shipped Move Filter tombstone section from Analysis tab" | The tombstone stub (`c1cb50d4`'s relocation-notice section) is still present verbatim in `AnalysisControls.vue:250-260` today. The *only* commit touching a "tombstone" near S16 (`197320ce`) is the unrelated S14 native-dialogs merge — no code change to the Move Filter section exists on `next` | GENUINELY-OPEN |
| lib-repair-open-interaction | (excluded per commissioner instruction — rework in flight, row 1090) | Builder returned, fresh-context review dispatching as of row 1090; not yet merged | GENUINELY-OPEN |
| tabwidget-space-doublefire | (excluded per commissioner instruction — review in flight) | Fix commit exists (`f5da3533`/`a770e972`) but item explicitly awaits commissioner word per row 1082/1101 | GENUINELY-OPEN |
| wheel-hover-gate-purity | (excluded per commissioner instruction — review in flight) | Same in-flight status per row 1082/1101 | GENUINELY-OPEN |

No UNCLEAR items remained after evidence-gathering — every item resolved to either a concrete
merge commit reachable from `next`, or a concrete absence of one.

## Method notes / caveats

- "Ancestor of `next`" was checked with `git merge-base --is-ancestor <sha> next`, confirming the
  commit is reachable from the current branch tip, not merely committed somewhere in a stale
  worktree/agent branch.
- Ledger "closed"/"merged" language in stopping-note prose was **not** trusted at face value —
  each claim was checked against an actual commit. Two cases where prose said "closed"/"shipped"
  but the ledger row is still open (`resolution-audit`, and the S14/S16 joint merge whose commit
  message says "tombstone removed") turned out to mean something narrower than a ledger close:
  deliverable produced but adjudication pending, or a conjoined-merge message covering two
  different work items where only one was actually delivered. The latter is exactly the
  `s16-tombstone` trap the commissioner flagged: never infer an item's disposition from a
  same-sounding word in a sibling item's commit message.
