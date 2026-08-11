<!--
  src/components/chrome/LytNode.vue

  W1 commission (`.claude/dispatch-reports/lyt-vue-realization-roadmap.md`
  §8 W1 item 3, "renderer"). Generic recursive component realizing a
  compiled LYT Split node (`state/lyt-layout.gen.ts`) as a live CSS Grid
  container — one grid per H/V node, nested to the tree's own depth,
  never flattening sibling subtrees into a shared grid (the same
  independence-of-subtrees discipline `research/lyt/emit_mockup.py`'s own
  docstring names as its second commissioner amendment; that module,
  read in full, is the normative source for the LYT -> CSS Grid mapping
  this component realizes at Vue runtime instead of static HTML).

  Leaves and the collapsed Exclusive (T) "blackbox" node are terminal —
  this component never recurses into them. Each is projected through a
  named slot (`#leaf-<mountingWidgetId>`) that App.vue's template fills
  with the real component and its full prop/event wiring (see
  `state/lyt-widget-registry.ts`'s header, "Why slots, not a live
  component table"). Nested Split children get their own recursive
  `<LytNode>` instance; ALL of App.vue's named slots are forwarded down
  to it (Vue's documented "forward every slot" pattern) so a leaf
  arbitrarily deep in the tree can still reach the slot content mounted
  at the App.vue level, however many LytNode levels separate them.

  Consecutive-sibling merge (disclosed judgment call, `lyt-widget-
  registry.ts`'s own per-entry notes): a leaf whose registry status is
  'absorbed' contributes no separate mount — its track is folded into
  the immediately-preceding sibling's spanning wrapper (`lytMountingWidgetId`
  resolves both to the SAME slot name). This is how two encoding-level
  reservations (e.g. I_board + A_board) become one real StatusBar mount
  spanning both tracks, without inventing a second widget registry
  concept beyond the `absorbed`/`mounted`/`absent` triad.

  Aspect-leaf containment: any leaf/blackbox whose `node.aspect` is set
  (only `B` and `previewBoard` this program) gets the `.lyt-board-cell`
  containment wrapper — `container-type:size` on the cell, with the
  slotted content itself expected to size via `min(100%,100cqh)`/
  `min(100%,100cqw)` (BoardWidget's existing board-square div already
  does; see the CSS block below for the class, ported from
  `research/lyt/emit_mockup.py`'s own proven `.board-cell` pattern —
  that module's docstring has the full B1-fix derivation).

  Runtime presence overrides (W2, `.claude/dispatch-reports/lyt-vue-
  realization-roadmap.md` §8 W2): the `presenceOverrides` prop is a
  path-independent widget-id -> boolean map (App.vue threads
  `store.session.ui.lytPresence` straight through, unchanged reference,
  forwarded verbatim to every recursive instance the same way
  `domIdsByPath` already is). `isPresent(child)` resolves a leaf/blackbox
  child's visibility as `presenceOverrides[widgetId] ?? child.
  presenceDefaultVisible` — an id absent from the override map (the
  common case: most leaves are never presence-menu targets) falls back to
  the compiled program's own static default, so W1's behavior is exactly
  reproduced for every widget the presence menu doesn't govern. A Split
  child has no single widget id of its own (only its DESCENDANT leaves
  can be individually toggled) and is therefore always present — an
  entire Split subtree collapsing as a unit is not a presence concept
  this program's compiled shape expresses; only leaf/blackbox children
  are ever toggle targets, per LYT SPEC.md §11's own "only a bare leaf
  can be named" scoping (this realization additionally treats the
  collapsed `controlPanel` blackbox as a toggle target too, a disclosed
  Vue-level extension beyond the static `.lyt` encoding's own release-
  toggle declarations — see `composables/chrome/useLytPresenceMenu.ts`'s
  header for why). A toggled-off leaf's track collapses to `0px`
  (release semantics, SPEC.md §3) and its slot content unmounts entirely
  (the `v-else-if="isPresent(...)"` gate below is a real `v-if`, not a
  `visibility:hidden` — Vue destroys the component instance, matching
  `release` rather than `preserve`).

  boardRail reservation generalization (W2): the `board-priority-clamp`
  track (the side control column, root child '2') now needs to know
  boardRail's OWN current reserved width to size correctly once boardRail
  can genuinely be visible — see `useLytTrackCss.ts`'s own header for the
  full derivation. `boardRailReservedPx` below finds a `boardRail` leaf
  among THIS node's own children (a hardcoded, disclosed cross-reference
  — this generalization is scoped to the one shape it's needed for, not a
  fully generic "any preceding sibling" mechanism; a `find()` over a
  small children array costs nothing and returns immediately for every
  non-root recursion, where no `boardRail` sibling exists) and reports its
  live reserved px (own fixed px + this split's gap) when visible, 0
  otherwise — 0 reproduces the pre-W2 formula exactly.

  DOM-id wiring (repair pass, ledger row 1781, W1 REPAIR — review finding
  B, `.claude/dispatch-reports/lyt-w1-skeleton-review.md` §3): the
  rejected prior attempt's template read `:id="domId('')"` unconditionally
  at every recursion depth, because no `path` prop threaded the current
  node's own position down through the recursive `<LytNode>` calls below —
  every nested instance looked up the SAME empty-string key in the
  (correctly, verbatim-forwarded) `domIdsByPath` map, so four separate
  grid `<div>`s all carried `id="split-workspace"` (duplicate ids,
  invalid HTML) while `#board-area`/`#tree-control-wrapper` never
  resolved to anything. Fixed by adding the `path` prop below: the ROOT
  call (App.vue) passes no `path` (defaults to `''`, its own true path),
  and each recursive Split call passes `:path="group.rep.path"` — the
  child wrapper's own dotted path, which is exactly the key
  `LYT_DOM_ID_BY_PATH` (App.vue) is keyed by. A mounted-DOM
  uniqueness+presence test (`tests/unit/lyt-dom-id-wiring.test.ts`) polices
  this so a regression fails loudly rather than silently reverting to the
  duplicate-id shape.

  Screen-class swap (W3, `.claude/dispatch-reports/lyt-vue-realization-
  roadmap.md` §8 W3): `classId` (forwarded verbatim, like every other
  cross-recursion prop here) resolves the widget registry per-class
  (`lyt-widget-registry.ts`'s own "class-scoped overrides" note) — portrait
  introduces widget ids (`A_top`) and dispositions (`I_engine`'s own
  standalone-vs-absorbed split) landscape's flat registry never
  anticipated. Omitted, this defaults to the pre-W3 class-agnostic lookup
  unchanged.

  Resizer drag overrides (W3): `trackStyleOverrides` is a path -> literal
  CSS track-value map (e.g. `{'2': '420px'}`), forwarded verbatim like
  `presenceOverrides`. When THIS node's own child at a given path has an
  entry, it wins VERBATIM over that child's own compiled `track` shape —
  the L4 single-writer realization (`useResizablePanel.ts`'s rewired drag
  math computes this map from the two persisted facts,
  `session.ui.treeControlRegionWidthPx`/`treePanelWidthPx`). A child
  absent from the map renders its own compiled track exactly as before —
  this is a pure, additive override, not a parallel sizing system.

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed, useSlots } from 'vue';
import type { LytChild, LytSplitNode } from '../../state/lyt-layout.gen';
import { lytMountingWidgetId, lytRegistryStatus } from '../../state/lyt-widget-registry';
import { trackCssValue, gapCssFor } from '../../composables/chrome/useLytTrackCss';

const props = withDefaults(
  defineProps<{
    node: LytSplitNode;
    /** This instance's own dotted path from the program root (e.g.
     *  '2.3'), used to look up its DOM id in `domIdsByPath`. `''` for
     *  the program root (App.vue's own top-level call correctly omits
     *  this prop, taking the default) — every recursive call below
     *  passes the child wrapper's own `path` explicitly, see the file
     *  header's "DOM-id wiring" note. */
    path?: string;
    /** path -> DOM id, forwarded verbatim to every recursive instance.
     *  Assigns the load-bearing legacy ids (#board-area, #control-panel,
     *  …) commission item 4 requires preserved — see App.vue's own
     *  `LYT_DOM_ID_BY_PATH` for the concrete map. */
    domIdsByPath?: Record<string, string>;
    /** widget id -> visible, forwarded verbatim to every recursive
     *  instance (W2). An id absent from this map falls back to that
     *  leaf/blackbox's own compiled `presenceDefaultVisible` — see the
     *  file header's "Runtime presence overrides" note. */
    presenceOverrides?: Record<string, boolean>;
    /** Which compiled program's own widget-registry disposition to
     *  resolve against (W3) — see the file header's "Screen-class swap"
     *  note. Undefined keeps the pre-W3 class-agnostic lookup. */
    classId?: string;
    /** child path -> literal CSS track value, forwarded verbatim (W3) —
     *  see the file header's "Resizer drag overrides" note. */
    trackStyleOverrides?: Record<string, string>;
  }>(),
  {
    path: '',
    domIdsByPath: () => ({}),
    presenceOverrides: () => ({}),
    classId: undefined,
    trackStyleOverrides: () => ({}),
  },
);

const slots = useSlots();

interface Group {
  readonly start: number;
  readonly span: number;
  readonly rep: LytChild; // the mounting (first) child of the group
}

// Run-length merge: a leaf/blackbox child whose registry entry resolves
// to a DIFFERENT mounting widget id (status 'absorbed') is folded into
// the immediately-preceding group rather than starting a new one. Split
// children are never merged (span always 1). Fails loudly (ADR-0002) if
// an 'absorbed' leaf appears WITHOUT a preceding mounting sibling in the
// same split — that would be a registry/encoding-order mismatch, not a
// case to silently skip.
const groups = computed<Group[]>(() => {
  const children = props.node.children;
  const out: Group[] = [];
  let i = 0;
  while (i < children.length) {
    const child = children[i];
    if (child.node.kind === 'split') {
      out.push({ start: i, span: 1, rep: child });
      i += 1;
      continue;
    }
    const widgetId = child.node.widget;
    const mountId = lytMountingWidgetId(widgetId, props.classId);
    if (mountId !== widgetId) {
      throw new Error(
        `LytNode: leaf ${JSON.stringify(widgetId)} at path ${JSON.stringify(child.path)} ` +
          `(classId=${JSON.stringify(props.classId ?? null)}) is registered 'absorbed' into ` +
          `${JSON.stringify(mountId)} but has no preceding mounting sibling in this split — ` +
          'lyt-widget-registry.ts absorbedInto targets must be an earlier sibling in encoding order.',
      );
    }
    let span = 1;
    while (i + span < children.length) {
      const next = children[i + span].node;
      if (next.kind === 'split') break;
      if (lytMountingWidgetId(next.widget, props.classId) !== mountId) break;
      span += 1;
    }
    out.push({ start: i, span, rep: child });
    i += span;
  }
  return out;
});

// A Split child has no single widget id of its own — only its
// descendant leaves are individually toggle targets (file header,
// "Runtime presence overrides"). `null` here means "always present."
function widgetIdOf(child: LytChild): string | null {
  return child.node.kind === 'split' ? null : child.node.widget;
}

function isPresent(child: LytChild): boolean {
  const id = widgetIdOf(child);
  if (id === null) return true;
  const override = props.presenceOverrides[id];
  return override ?? child.presenceDefaultVisible;
}

// boardRail reservation generalization — see file header. Finds a
// `boardRail` leaf among THIS node's own children (present only at the
// program root; every other recursion's `find` returns undefined
// immediately) and reports its live reserved px when visible.
const boardRailReservedPx = computed<number>(() => {
  const rail = props.node.children.find(
    (c) => c.node.kind === 'leaf' && c.node.widget === 'boardRail',
  );
  if (!rail || rail.node.kind !== 'leaf' || rail.track.kind !== 'fixed') return 0;
  if (!isPresent(rail)) return 0;
  return rail.track.px + props.node.gapPx;
});

const trackList = computed<string[]>(() =>
  props.node.children.map((c) => {
    if (!isPresent(c)) return '0px';
    // W3: a persisted resizer drag wins VERBATIM over the compiled
    // program's own track shape for this one child's path — see the
    // file header's "Resizer drag overrides" note. Checked BEFORE the
    // board-priority-clamp special case below: a dragged wrapper/tree
    // width is a real user fact the generated formula must yield to,
    // not merely another input feeding it.
    const override = props.trackStyleOverrides[c.path];
    if (override !== undefined) return override;
    // board-priority-clamp is carried by the side column child, which is
    // itself a nested Split (node.kind === 'split') — the reservation
    // generalization applies regardless of the child's own node kind,
    // since `track` describes the child's OWN reserved extent along
    // THIS split's axis either way.
    if (c.track.kind === 'board-priority-clamp') {
      return trackCssValue(c.track, boardRailReservedPx.value);
    }
    // W4 item 4 (MiniBoard/previewBoard viewport clamp): a FIXED track
    // on an ASPECT leaf (today, only `previewBoard` — `B`'s own track
    // is 'board-priority-clamp'/'elastic', never 'fixed') is a rigid
    // CSS Grid track that never shrinks below its declared px, even
    // when the enclosing row's OTHER siblings' own hard floors (the
    // tree leaf, the collapsed control-panel blackbox) already exceed
    // the row's available width — exactly the screenshot defect the
    // commissioner reported ("previewBoard MiniBoard can be pushed
    // partially off-viewport"). This is a REALIZATION-only recovery
    // (the .lyt encoding's own declared `{min 160px, pref 160px, max
    // 160px, aspect 1}` is untouched — LYT's sizing stratum still
    // reserves exactly 160px as this leaf's PREFERRED extent; only the
    // Vue-runtime CSS mapping additionally allows it to shrink toward
    // 0 as a graceful-recovery floor), scoped to exactly the aspect+
    // fixed combination — every other fixed leaf (tree, the info/
    // action strips) is untouched and stays rigidly reserved. The
    // paired half of this fix is `.lyt-board-cell`'s own containment
    // (`container-type:size` below) plus `PreviewBoardPanel.vue`'s own
    // `aspect-ratio:1` + `max-width/max-height:100%` — together they
    // guarantee the leaf STAYS SQUARE and FULLY VISIBLE at whatever
    // size the shrunk cell provides, never distorted, never clipped.
    if (isAspectLeaf(c) && c.track.kind === 'fixed') {
      return `minmax(0px, ${c.track.px}px)`;
    }
    return trackCssValue(c.track);
  }),
);

const gapCss = computed(() => gapCssFor(props.node.axis, props.node.gapPx));

const gridStyle = computed(() => {
  const tracks = trackList.value.join(' ');
  return props.node.axis === 'h'
    ? {
        display: 'grid',
        gridAutoFlow: 'column',
        gridTemplateColumns: tracks,
        gridTemplateRows: '1fr',
        columnGap: gapCss.value.columnGap,
        rowGap: gapCss.value.rowGap,
      }
    : {
        display: 'grid',
        gridAutoFlow: 'row',
        gridTemplateRows: tracks,
        gridTemplateColumns: '1fr',
        columnGap: gapCss.value.columnGap,
        rowGap: gapCss.value.rowGap,
      };
});

function placementStyle(group: Group) {
  const a = group.start + 1;
  const b = group.start + group.span + 1;
  return props.node.axis === 'h'
    ? { gridColumn: `${a} / ${b}`, gridRow: '1' }
    : { gridRow: `${a} / ${b}`, gridColumn: '1' };
}

function domId(path: string): string | undefined {
  return props.domIdsByPath[path];
}

function isAspectLeaf(child: LytChild): boolean {
  return child.node.kind === 'leaf' && child.node.aspect !== null;
}

function registryStatus(widgetId: string) {
  return lytRegistryStatus(widgetId, props.classId);
}

// Vue's documented "forward every slot" pattern — a nested <LytNode>
// needs access to every #leaf-* slot App.vue supplied at the TOP of the
// recursion, however many levels down the matching leaf is.
const slotNames = computed(() => Object.keys(slots));
</script>

<template>
  <div :id="domId(path)" class="lyt-node" :style="gridStyle">
    <template v-for="group in groups" :key="group.start">
      <!-- Nested Split: recurse, forwarding every slot and this group's
           OWN path (the child wrapper's dotted path, e.g. '2.3') so the
           nested instance's root <div> resolves its own DOM id instead
           of repeating the parent's — see the file header's "DOM-id
           wiring" note. -->
      <div
        v-if="group.rep.node.kind === 'split'"
        :style="placementStyle(group)"
        class="lyt-node-slot"
        style="min-width: 0; min-height: 0; width: 100%; height: 100%"
      >
        <LytNode
          :node="group.rep.node"
          :path="group.rep.path"
          :dom-ids-by-path="domIdsByPath"
          :presence-overrides="presenceOverrides"
          :class-id="classId"
          :track-style-overrides="trackStyleOverrides"
        >
          <!-- Forward every named slot App.vue supplied at the top of the
               recursion. None of LytNode's leaf slots are SCOPED (App.vue
               passes plain content, never `v-bind`-ed props into a leaf),
               so a bare pass-through — no slotProps capture — is enough. -->
          <template v-for="name in slotNames" #[name] :key="name">
            <slot :name="name" />
          </template>
        </LytNode>
      </div>

      <!-- Leaf / blackbox: terminal. Not rendered at all when presence
           says absent (W1: static `presenceDefaultVisible`; W2: the
           runtime `presenceOverrides` map — see the file header's
           "Runtime presence overrides" note) or when the registry has no
           component for it yet ('absent' with no visible placeholder
           needed). A real `v-if`, not `visibility:hidden` — toggling off
           unmounts the component instance (release semantics). -->
      <div
        v-else-if="isPresent(group.rep)"
        :id="domId(group.rep.path)"
        :style="{ ...placementStyle(group), minWidth: '0', minHeight: '0' }"
        :class="['lyt-leaf-cell', { 'lyt-board-cell': isAspectLeaf(group.rep) }]"
      >
        <slot v-if="registryStatus(group.rep.node.widget) !== 'absent'" :name="'leaf-' + group.rep.node.widget" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.lyt-node {
  min-width: 0;
  min-height: 0;
  /* W1 REPAIR (ledger row 1781): a `display:grid` element with no
     explicit size sizes to its OWN CONTENT's natural dimensions in
     normal block flow -- it does NOT inherit its parent's size the way
     a grid ITEM does by default (`align-items:stretch`). At the OUTER
     level this was invisible: `.lyt-node`'s root instance IS a direct
     grid item of `#main-workspace`'s flex layout (`flex:1`, `#split-
     workspace`'s own CSS rule below in App.vue), so it stretched
     correctly. But every NESTED `.lyt-node` (recursed through
     `.lyt-node-slot`, a PLAIN block div, not itself a grid/flex
     container) never got that stretch -- its `1fr` row track then
     measured against an effectively UNBOUNDED content-driven height
     instead of its true allotted cell height, and ballooned to fit
     whatever content the elastic row's descendants (the tree/control-
     panel row, transitively) naturally wanted. Empirically: the side
     column's own nested grid measured 3644px tall at 1920x1080 (vs.
     its true 1080px cell) before this fix -- clipped invisible by an
     `overflow:hidden` ancestor, so the PAGE never visibly broke, but
     `#vue-tree-panel`'s own `getBoundingClientRect()` (and any
     ResizeObserver reading it, e.g. TreeWidget's own virtualization)
     saw the wrong number. `width:100%; height:100%` on this class (the
     nested-grid CONTAINER) plus the matching pair on `.lyt-node-slot`'s
     inline style (the WRAPPER one level up, in the template below) is
     the fix -- explicit sizing that doesn't depend on a stretch default
     the actual DOM nesting here (div-in-div, not item-in-grid) never
     provided in the first place. */
  width: 100%;
  height: 100%;
}
/* Aspect-leaf containment (ported from research/lyt/emit_mockup.py's
   `.board-cell` — that module's docstring has the full B1-fix
   derivation): the cell keeps its grid-assigned width/height and
   establishes a definite size-contained box; the SLOTTED content (e.g.
   BoardWidget's own #board-square) is expected to size itself via
   min(100%,100cqh)/min(100%,100cqw) and center via place-items. */
.lyt-board-cell {
  container-type: size;
  display: flex;
  place-items: center;
}
</style>
