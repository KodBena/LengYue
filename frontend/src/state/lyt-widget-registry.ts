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

// The seven leaf widget ids `encodings/lengyue_landscape.lyt`'s compiled
// program can carry, plus `controlPanel` (the collapsed Exclusive/T node
// — see `lyt-layout.gen.ts`'s own header for why the five CP-* children
// are not separately registered leaves this wave).
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
    note: 'Judgment call: the encoding reserves I_board (24px, info) and A_board (28px, action) as two adjacent bands under the board, but the real StatusBar.vue is ALREADY one component carrying both an info readout and its action buttons internally (unlike the encoding\'s split). I_board\'s mount spans both tracks (spanTracks: 2 in the renderer call site) rather than splitting StatusBar in two; A_board is registered ABSORBED into I_board below. Total reserved height (52px) is unchanged from the encoding\'s own two-band sum.',
  },
  A_board: {
    widget: 'A_board',
    component: null,
    status: 'absorbed',
    slotName: null,
    absorbedInto: 'I_board',
    note: 'See I_board\'s note — StatusBar\'s own action row satisfies this leaf; no separate mount.',
  },

  // ── Side column strips (root child 2: A_go / I_engine / A_common) ──────
  A_go: {
    widget: 'A_go',
    component: 'Toolbar',
    status: 'mounted',
    slotName: '#leaf-A_go',
    absorbedInto: null,
    note: 'Judgment call, disclosed: the encoding reserves three separate 28px bands (A_go/I_engine/A_common) for what the real app renders as ONE existing Toolbar.vue component (go actions + engine info/controls + common actions, already internally clustered). Decomposing Toolbar.vue into three independently-addressable leaf components is a real refactor beyond "mount existing buttons" — deferred; W1 mounts the whole existing Toolbar unchanged, spanning all three tracks (spanTracks: 3). This also moves Toolbar from its old horizontal top-nav-bar position to a vertical strip in the side column — a real, disclosed structural change the roadmap\'s own §2 commissions ("toolbar row structure — clusters regrouped per the census"). LocalePicker (previously in App.vue\'s `.right-toggles`, no leaf of its own in the census) rides along in this same mount rather than getting a dedicated leaf.',
  },
  I_engine: {
    widget: 'I_engine',
    component: null,
    status: 'absorbed',
    slotName: null,
    absorbedInto: 'A_go',
    note: 'See A_go\'s note — Toolbar\'s own engine-info cluster (ToolbarEngineMetrics/ToolbarEngineUri) satisfies this leaf.',
  },
  A_common: {
    widget: 'A_common',
    component: null,
    status: 'absorbed',
    slotName: null,
    absorbedInto: 'A_go',
    note: 'See A_go\'s note — Toolbar\'s own common-actions cluster (Connect, sliders popover, SetupToolPalette\'s docked slot, debug pill) satisfies this leaf. The setup-palette no-occlusion ruling travels with Toolbar unchanged (SetupToolPalette is Toolbar\'s own child, untouched by this rework).',
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
    slotName: '#leaf-controlPanel',
    absorbedInto: null,
    note: 'The collapsed T(CP-*) black-box node (see lyt-layout.gen.ts header). TabWidget.vue already owns the tab-strip-plus-body realization internally with its own five named slots (#library/#cards/#settings/#analysis/#other) — those are unchanged, App.vue\'s existing tab-body templates ride along verbatim inside this one mount.',
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
};

/**
 * Every LYT widget id, resolved to the widget id that actually MOUNTS a
 * component for it (itself, unless `status === 'absorbed'`). Used by
 * LytNode.vue to detect consecutive-sibling runs that share a mount and
 * fold them into one spanning wrapper.
 */
export function lytMountingWidgetId(widgetId: string): string {
  const entry = LYT_WIDGET_REGISTRY[widgetId];
  if (!entry) {
    throw new Error(
      `lytMountingWidgetId: no LYT_WIDGET_REGISTRY entry for widget id ${JSON.stringify(widgetId)} — ` +
        'every leaf lyt-layout.gen.ts can carry must be registered (mounted/absorbed/absent), per ' +
        'the roadmap\'s own "every unmapped encoding leaf" disclosure requirement.',
    );
  }
  return entry.status === 'absorbed' && entry.absorbedInto ? entry.absorbedInto : widgetId;
}
