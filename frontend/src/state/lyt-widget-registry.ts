/**
 * src/state/lyt-widget-registry.ts
 *
 * W1 commission (`.claude/dispatch-reports/lyt-vue-realization-roadmap.md`
 * §8 W1 item 2, "widget registry"). Maps every leaf widget id the compiled
 * LYT program (`lyt-layout.gen.ts`) can carry to a mount disposition: an
 * existing component (mounted through a named Vue slot App.vue fills in
 * with the real prop/event wiring — see the "Why slots, not a live
 * component table" note below), a leaf whose track is ABSORBED into a
 * preceding sibling's spanning mount (the two adjacent slots read as one
 * widget in the real app even though the encoding models them as two
 * reserved bands), or a leaf with no current component (rendered as an
 * empty reserved track this wave).
 *
 * Why slots, not a live component table: a plain `.ts` data module can
 * hold component REFERENCES (`import BoardWidget from ...`), but every one
 * of these mounts also needs bespoke props/events sourced from App.vue's
 * own composables (`activeBoard`, `handleBoardMove`, `engineControls`, …).
 * A generic prop-bag big enough to carry all of that would duplicate
 * App.vue's wiring in a second, easily-drifting place — worse than the
 * indirection it would save. `LytNode.vue` instead renders each leaf as a
 * named scoped slot (`#leaf-<widgetId>`), and App.vue's template — which
 * already has every composable in scope — fills each slot with the real
 * component and its full wiring, unchanged from how it was wired before
 * this rework. This registry is the DATA half of that contract (which
 * widget ids exist, what each one's disposition is); the SLOT NAMES are
 * the mechanism half.
 *
 * Regeneration: this file is hand-authored, not generated — the mapping
 * is a reconciliation judgment call (which real component satisfies which
 * encoding leaf), not a derivation from the `.lyt` source the way
 * `lyt-layout.gen.ts` is. Update it by hand when a leaf's disposition
 * changes (a new component ships for `previewBoard`, W2's boardRail
 * presence-menu wiring flips `boardRail` from unrendered-but-mounted to
 * actually visible, etc).
 *
 * LYT TOOLBAR ONTOLOGY REENCODE (commissioner-ratified 2026-08-11, ledger
 * rows 1930/1931; `.claude/dispatch-reports/lyt-toolbar-ontology-reencode.md`):
 * the three-leaf A_go/I_engine/A_common side-column strip (all three
 * 'absorbed' into one merged `Toolbar.vue` mount) is retired. Two leaves —
 * `A_engine` (envelope-reserved over engine connection state) and `A_app`
 * — replace it, each with its OWN dedicated component
 * (`ToolbarEngineCluster.vue` / `ToolbarAppCluster.vue`), no absorption
 * needed. Both leaves carry the SAME identity and disposition in BOTH
 * screen classes now (landscape's own root child '2' V-split children;
 * portrait's own root V children, formerly named `A_top`/`I_engine` —
 * see `research/lyt/encodings/lengyue_portrait.lyt`'s own header for why
 * that class's tree needed only a rename, not a reshuffle), so the W3
 * class-scoped-override table below is now EMPTY — the divergence it
 * used to carry (portrait's `I_engine` mounting nothing) is closed: both
 * of portrait's own former gaps (A_top's Toolbar duplication note,
 * I_engine's disclosed absence) are resolved by portrait gaining a real,
 * working engine cluster it never had before.
 *
 * License: Public Domain (The Unlicense)
 */

export type LytWidgetStatus =
  | 'mounted'   // a real component exists; App.vue fills `slotName` with it.
  | 'absorbed'  // no separate slot — this leaf's reserved track is folded
                // into `absorbedInto`'s spanning mount (see LytNode.vue's
                // `spanTracks` handling). The absorbing widget's own
                // component already renders this leaf's content.
  | 'absent';   // no current component satisfies this leaf this wave; the
                // track is still reserved (empty) so the grid geometry
                // matches the compiled program, but nothing mounts.

export interface LytWidgetRegistryEntry {
  readonly widget: string;
  /** Human-readable component name, for the report / doc trail. The LIVE
   *  wiring lives in App.vue's template via `slotName`, not here — see
   *  the file header's "Why slots" note. */
  readonly component: string | null;
  readonly status: LytWidgetStatus;
  /** Named slot App.vue's template fills, e.g. '#leaf-B'. Null when
   *  `status` is 'absorbed' or 'absent' (nothing to fill). */
  readonly slotName: string | null;
  /** Set only when `status === 'absorbed'`: the widget id whose mount
   *  spans this leaf's own track too (`LytNode.vue`'s run-length merge —
   *  consecutive sibling leaves resolving to the SAME `absorbedInto`
   *  target are rendered as one wrapper spanning every one of their
   *  tracks, in encoding order). */
  readonly absorbedInto: string | null;
  readonly note: string;
}

// The leaf widget ids `encodings/lengyue_landscape.lyt`'s compiled program
// can carry, plus `controlPanel` (the now-OPENED control-panel Exclusive
// node's own representative id — see `lyt-layout.gen.ts`'s header,
// "REALIZATION WAVE", for what opened vs. stayed collapsed this wave).
export const LYT_WIDGET_REGISTRY: Readonly<Record<string, LytWidgetRegistryEntry>> = {
  // ── Board composite (root child 1: B / I_board / A_board) ──────────────
  B: {
    widget: 'B',
    component: 'BoardWidget',
    status: 'mounted',
    slotName: '#leaf-B',
    absorbedInto: null,
    note: 'Mounted inside the aspect-leaf containment wrapper LytNode.vue applies to every node.aspect !== null leaf (the .board-cell/.board-square pattern proven in research/lyt/emit_mockup.py).',
  },
  I_board: {
    widget: 'I_board',
    component: 'StatusBar',
    status: 'mounted',
    slotName: '#leaf-I_board',
    absorbedInto: null,
    note: 'Judgment call: the encoding reserves I_board (24px, info) and A_board (28px, action) as two adjacent bands under the board, but the real StatusBar.vue is ALREADY one component carrying both an info readout and its action buttons internally (unlike the encoding\'s split). I_board\'s mount spans both tracks (spanTracks: 2 in the renderer call site) rather than splitting StatusBar in two; A_board is registered ABSORBED into I_board below. Total reserved height (52px) is unchanged from the encoding\'s own two-band sum. LYT toolbar ontology reencode (item 1, "board controls go to the board"): StatusBar.vue now ALSO mounts the relocated move-navigation cluster (ToolbarMoveNav) inside this same span — see that file\'s own header.',
  },
  A_board: {
    widget: 'A_board',
    component: null,
    status: 'absorbed',
    slotName: null,
    absorbedInto: 'I_board',
    note: 'See I_board\'s note — StatusBar\'s own action row satisfies this leaf; no separate mount.',
  },

  // ── Side column clusters (root child 2: A_engine / A_app) ──────────────
  A_engine: {
    widget: 'A_engine',
    component: 'ToolbarEngineCluster',
    status: 'mounted',
    slotName: '#leaf-A_engine',
    absorbedInto: null,
    note: 'LYT toolbar ontology reencode (item 2, "ONE ENGINE CLUSTER, ENVELOPE-RESERVED"): connect/disconnect, the engine-controls button cluster (mint-card/learn-path/play/match), and engine metrics (ToolbarEngineMetrics) are ONE dedicated component now, mounted here in its own right — no absorption, no merge with A_app. The encoding\'s own `envelope: {disconnected, connected}` sizing basis (see lengyue_landscape.lyt/lengyue_portrait.lyt) reserves the MAX across engine states, so ToolbarEngineMetrics mounting/unmounting on connect/disconnect never re-partitions a sibling — the commissioner\'s witnessed defect ("actions still reorganize the buttons...e.g. connecting") forecloses by construction.',
  },
  A_app: {
    widget: 'A_app',
    component: 'ToolbarAppCluster',
    status: 'mounted',
    slotName: '#leaf-A_app',
    absorbedInto: null,
    note: 'LYT toolbar ontology reencode (item 3, "ONE APP CLUSTER"): Load/Save SGF, the sliders/setup/PBO popover triggers, the engine URI editor, and the locale picker — self-contained (see ToolbarAppCluster.vue\'s own header for why it sources its own composables rather than App.vue threading them through). Structurally independent of engine connection state (audited: no widget in this cluster reads `useEngineControls`).',
  },

  // ── Tree / control-panel / preview row (root child 2.3) ────────────────
  tree: {
    widget: 'tree',
    component: 'TreeWidget',
    status: 'mounted',
    slotName: '#leaf-tree',
    absorbedInto: null,
    note: 'Direct mount, unchanged wiring from the pre-rework App.vue (same props/events).',
  },
  controlPanel: {
    widget: 'controlPanel',
    component: 'TabWidget',
    status: 'mounted',
    // REALIZATION WAVE (`.claude/dispatch-reports/lyt-realization-wave.md`):
    // the control-panel T is no longer a single collapsed leaf -- it is a
    // genuine `kind: 'exclusive'` node (lyt-layout.gen.ts). LytNode.vue's own
    // Exclusive case renders it directly (a live TabWidget instance it
    // drives itself, converged with — not a second implementation of —
    // TabWidget.vue), so this entry is no longer consulted by
    // `lytMountingWidgetId`/`lytRegistryStatus` at runtime (those are only
    // ever called for LEAF/blackbox widget ids). Kept as documentation: the
    // representative widget id 'controlPanel' is still what
    // `domIdsByPath`/`LYT_DOM_ID_BY_PATH` key the `#control-panel` DOM id
    // against (App.vue's own resizer-inner anchor).
    slotName: null,
    absorbedInto: null,
    note: 'The now-OPENED Exclusive(T) node (see lyt-layout.gen.ts header, "REALIZATION WAVE"). LytNode.vue\'s Exclusive case reuses TabWidget.vue directly (v-model + dynamic named slots per child) rather than mounting App.vue\'s own TabWidget instance — App.vue instead fills the five per-tab leaf slots below (#leaf-CP-library / #leaf-CP-cards / #leaf-CP-settings / #leaf-CP-analysis, plus #leaf-otherColorDebug / #leaf-otherBand for the opened Other tab).',
  },
  'CP-library': {
    widget: 'CP-library',
    component: 'LibraryTab',
    status: 'mounted',
    slotName: '#leaf-CP-library',
    absorbedInto: null,
    note: 'REALIZATION WAVE: the control-panel T\'s own Library tab, opened live (item 1/2). Unchanged component/wiring from the pre-wave #library TabWidget slot — only the mount path moved (LytNode\'s Exclusive case instead of App.vue-authored TabWidget). scrollAxes: [v] (encoding-declared) derives this leaf\'s own overflow-y — see useLytOverflowCss.ts.',
  },
  'CP-cards': {
    widget: 'CP-cards',
    component: 'ForestDirectory',
    status: 'mounted',
    slotName: '#leaf-CP-cards',
    absorbedInto: null,
    note: 'REALIZATION WAVE: the control-panel T\'s own Cards tab, opened live — see CP-library\'s own note for the shape (identical: pre-wave #cards TabWidget slot, unchanged wiring, scrollAxes: [v] derived overflow).',
  },
  // ── Settings interior, OPENED LIVE (work item `lyt-settings-live-
  //    opening`, ledger rows 2007/2009/2001) ─────────────────────────────
  // `CP-settings` is no longer a collapsed synthetic leaf — the encoding's
  // own `V(settingsSubstrip, settingsPane)` interior (research/lyt's own
  // `control_panel_collapse_indices` drops `{2, 3}` -> `{3}`) is a genuine
  // `split` node LytNode.vue's existing generic Split recursion already
  // handles (no LytNode.vue change needed — the recursion was already
  // total over Leaf|Split|Exclusive). SettingsTab.vue's own composition
  // boundary is split accordingly: `SettingsSubstrip.vue` (the flow-
  // wrap-capable sub-tab strip, TabWidget driven with `part="header"`)
  // mounts at `settingsSubstrip`; `SettingsPane.vue` (the six sub-tab
  // bodies, TabWidget driven with `part="body"`) mounts at `settingsPane`
  // — ONE tab implementation still (TabWidget.vue), driven twice from two
  // separately-mounted LYT leaves sharing state via
  // `composables/chrome/useSettingsSubTab.ts`'s own module-singleton ref
  // (see that file's header for why a singleton, not a store field, is
  // the honest shape here). `SettingsTab.vue` is retired.
  settingsSubstrip: {
    widget: 'settingsSubstrip',
    component: 'SettingsSubstrip',
    status: 'mounted',
    slotName: '#leaf-settingsSubstrip',
    absorbedInto: null,
    note: 'The flow-wrap-capable settings sub-tab strip (research/lyt/flow.py; `SPEC-AMENDMENTS.md` rows 2007/2009). `content bounded`, no scrollAxes — the strip never scrolls; CSS flex-wrap (TabWidget.vue\'s own `wrap` prop) realizes the SAME greedy left-to-right packing the encoding\'s own flow-envelope derivation computes offline.',
  },
  settingsPane: {
    widget: 'settingsPane',
    component: 'SettingsPane',
    status: 'mounted',
    slotName: '#leaf-settingsPane',
    absorbedInto: null,
    note: 'The six settings sub-tab bodies (Session/Analysis Environment/Card Sets/Advanced Registry/Analysis/Keybindings), moved verbatim from the retired SettingsTab.vue. scrollAxes: [v] (encoding-declared, the disclosed worst-case-superset classification — see `lengyue_landscape.lyt`\'s own header) derives this leaf\'s own outer overflow; TabWidget\'s own `.tab-body` blanket scroll is retired for this instance (`ownsScroll=false`) so each sub-pane\'s own existing internal scroll owner (`.registry-container`\'s own `overflow-y:auto`, KeybindingsView\'s own) is the SOLE scroll owner on its path (L5b single-scroll-owner) — disclosed narrowing: the ratified per-pane classification table (Advanced Registry/Keybindings scroll-owned, the other four no-scroll AT DECLARED DEMAND) is not fully re-derived at the component-CSS level this wave; the four "no-scroll" panes keep their pre-existing `.registry-container` scroll behavior unchanged, named honestly rather than silently redesigned.',
  },
  'CP-analysis': {
    widget: 'CP-analysis',
    component: 'AnalysisControls',
    status: 'mounted',
    slotName: '#leaf-CP-analysis',
    absorbedInto: null,
    note: 'REALIZATION WAVE: a SYNTHETIC collapsed-subtree leaf, same shape as CP-settings above. Mounts AnalysisControls/AnalysisDashboard.vue unchanged — DELIBERATELY not opened to the encoding\'s own nested `T(AT_basic, AT_distributions, AT_stability, AT_multires)` this wave: AnalysisDashboard owns a genuinely DYNAMIC, user-configurable tab set (`AppSettings.analysisTabs`), and the encoding models only the STATIC default configuration (ratified consult §8.3\'s own named residual) — rendering it live would silently override a user\'s customized tabs. No scrollAxes derived here — AnalysisDashboard\'s own `.scrollable-content{overflow-y:auto}` keeps its pre-wave behavior unchanged.',
  },

  // ── Corner presence-menu targets (default-off; roadmap §8 W2) ──────────
  boardRail: {
    widget: 'boardRail',
    component: 'SidebarWidget',
    status: 'mounted',
    slotName: '#leaf-boardRail',
    absorbedInto: null,
    note: 'W2: mounts SidebarWidget.vue into this leaf when `session.ui.railStyle === \'slot\'` AND `session.ui.lytPresence.boardRail` is true (style A, roadmap §7 ruling 2). Style B (`railStyle === \'popover\'`) keeps this leaf\'s runtime presence override forced false regardless of `lytPresence.boardRail` — App.vue computes the override map, not LytNode.vue — so the grid track never claims standing space in that style; the rail instead renders inside `BoardRailPopoverTrigger.vue`\'s own popover, reusing the SAME SidebarWidget instance shape (a second mount, not a shared component instance — Vue components are not multiply-homed).',
  },
  previewBoard: {
    widget: 'previewBoard',
    component: 'PreviewBoardPanel',
    status: 'mounted',
    slotName: '#leaf-previewBoard',
    absorbedInto: null,
    note: 'W2: mounts PreviewBoardPanel.vue (components/board/PreviewBoardPanel.vue), a read-only MiniBoard-based preview reusing LibraryPreviewPane\'s boardSnapshot-projection machinery. DISCLOSED SCOPE NARROWING (commission item 3, P1/P2): the variation-to-display fact ("what is the user currently hovering/considering in the tree/analysis surfaces") does not exist as readable derived state yet, so this mounts the ACTIVE BOARD\'s current position as a placeholder — a real, honest preview of *something* (today\'s board), not a stub — rather than inventing new analysis plumbing. Upgrading to true variation-hover content is a later, disclosed arc.',
  },

  // ── Other tab, opened live (REALIZATION WAVE item 4, §9.3's Other-tab
  //    split) — the control-panel T's own "other" tab is now a genuine
  //    Split(otherColorDebug, otherBand), not a collapsed leaf. ──────────
  otherColorDebug: {
    widget: 'otherColorDebug',
    component: 'ColorDebugStrip',
    status: 'mounted',
    slotName: '#leaf-otherColorDebug',
    absorbedInto: null,
    note: 'REALIZATION WAVE item 4: the fixed, designed-height band (content designed, no scroll declared — L5c\'s chart-exclusion) of the Other tab\'s split. Mounts ColorDebugStrip.vue, unchanged wiring from the pre-wave single #other slot.',
  },
  otherBand: {
    widget: 'otherBand',
    component: null,
    status: 'mounted',
    slotName: '#leaf-otherBand',
    absorbedInto: null,
    note: 'REALIZATION WAVE item 4: the scroll-owned band (content unbounded, scroll v declared) of the Other tab\'s split — KnobRegistryEditor + the gradient-calibration notice + VisitsLerpConfig + PerQueryOverridesConfig + QeuboBookmarks, the SAME four components the pre-wave single #other slot mounted together, now grouped under one scroll owner rather than riding the retired ancestor TabWidget `.tab-body` scroll. `component: null` because this leaf mounts a GROUP, not one named component — see App.vue\'s own #leaf-otherBand template for the full list.',
  },
};

// ── W3: class-scoped overrides ──────────────────────────────────────────
//
// EMPTY as of the LYT toolbar ontology reencode (2026-08-11) — see this
// file's own header note. Retained (rather than deleted along with the
// call-site plumbing in `lytMountingWidgetId`/`lytRegistryStatus` below)
// because the mechanism is still the honest home for a FUTURE genuine
// per-class divergence, and removing it would touch `LytNode.vue`'s and
// `App.vue`'s `classId` threading for zero behavioural gain today — an
// empty override table is byte-identical in effect to "no override
// mechanism at all" for every current lookup.
export const LYT_WIDGET_REGISTRY_OVERRIDES_BY_CLASS: Readonly<
  Record<string, Readonly<Record<string, LytWidgetRegistryEntry>>>
> = {};

/**
 * Every LYT widget id, resolved to the widget id that actually MOUNTS a
 * component for it (itself, unless `status === 'absorbed'`). Used by
 * LytNode.vue to detect consecutive-sibling runs that share a mount and
 * fold them into one spanning wrapper.
 *
 * `classId` (W3): when given and `LYT_WIDGET_REGISTRY_OVERRIDES_BY_CLASS`
 * declares an override for `(classId, widgetId)`, the override wins over
 * the flat, class-agnostic table above — see that table's own header for
 * why portrait needs this. Omitted (or a class with no override table)
 * falls through to the unchanged pre-W3 lookup.
 */
export function lytMountingWidgetId(widgetId: string, classId?: string): string {
  const override = classId ? LYT_WIDGET_REGISTRY_OVERRIDES_BY_CLASS[classId]?.[widgetId] : undefined;
  const entry = override ?? LYT_WIDGET_REGISTRY[widgetId];
  if (!entry) {
    throw new Error(
      `lytMountingWidgetId: no LYT_WIDGET_REGISTRY entry for widget id ${JSON.stringify(widgetId)} ` +
        `(classId=${JSON.stringify(classId ?? null)}) — every leaf a compiled LYT program can carry must ` +
        'be registered (mounted/absorbed/absent), per the roadmap\'s own "every unmapped encoding leaf" ' +
        'disclosure requirement.',
    );
  }
  return entry.status === 'absorbed' && entry.absorbedInto ? entry.absorbedInto : widgetId;
}

/**
 * `registryStatus`'s own class-aware counterpart (LytNode.vue's template
 * consults this to decide whether a leaf's slot content should render at
 * all) — same override precedence as `lytMountingWidgetId` above.
 */
export function lytRegistryStatus(widgetId: string, classId?: string): LytWidgetStatus {
  const override = classId ? LYT_WIDGET_REGISTRY_OVERRIDES_BY_CLASS[classId]?.[widgetId] : undefined;
  return (override ?? LYT_WIDGET_REGISTRY[widgetId])?.status ?? 'absent';
}
