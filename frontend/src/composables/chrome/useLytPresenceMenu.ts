/**
 * src/composables/chrome/useLytPresenceMenu.ts
 *
 * W2 commission (`.claude/dispatch-reports/lyt-vue-realization-roadmap.md`
 * §8 W2 item 1 + ledger row 1743). Logic for the corner presence menu:
 * which LYT leaves/blackboxes are togglable, each one's current
 * checked state, the last-remaining-panel guard (the mockup's N2 fix,
 * `research/lyt/emit_mockup.py`'s `_SCRIPT` — the semantics ported here,
 * not the JS itself), and the rail-style setting the same popover hosts
 * an inline selector for.
 *
 * ── Scope: three targets, not the mockup's seven ────────────────────
 * `research/lyt/emit_mockup.py`'s own `TOGGLE_TARGETS` registers SEVEN
 * landscape-class entries (Board Rail, Board & Controls, Go Actions,
 * Engine Info, Common Actions, Tree & Panels, Preview Board) because the
 * mockup's `.lyt` encoding reserves each as an independently-addressable
 * band. The real Vue app does not: `lyt-widget-registry.ts`'s own notes
 * record that A_engine/A_app (formerly the three-way A_go/I_engine/
 * A_common split, collapsed by the LYT toolbar ontology reencode,
 * 2026-08-11) each mount through their own dedicated cluster component
 * (never independently sub-divisible below the cluster) and
 * B/I_board/A_board mount through the board composite + StatusBar (never
 * independently hideable — the board is architecturally always-mounted,
 * roadmap §5). Toggling those four would either do nothing real or hide
 * the board itself, neither of which the commission asks for. The
 * commission text
 * itself narrows the menu to exactly three targets: `boardRail`,
 * `previewBoard`, and "the control-panel group" — this module's
 * `LYT_PRESENCE_TARGETS`.
 *
 * ── controlPanel: a disclosed Vue-level extension beyond the .lyt encoding ──
 * `research/lyt/encodings/lengyue_landscape.lyt` does NOT declare
 * `@toggle(user, release)` on the `T(CP-*)` node — only `boardRail` and
 * `previewBoard` carry that presence kind in the compiled program
 * (`lyt-layout.gen.ts`'s own `presenceDefaultVisible` is a static `true`
 * for `controlPanel`, with no distinct "is this a release toggle"
 * signal surviving the AST -> generated-TS compilation). The mockup's
 * own `TOGGLE_TARGETS`, by contrast, DOES register this region ("Tree &
 * Panels", `release`, default `true`) — a UI-registry-layer affordance
 * the static `.lyt` source itself never asserted (`SPEC.md` §11's own
 * "presence.py... a narrower concept than emit_mockup.py's own path-keyed
 * UI-toggle registry" disclosure names exactly this kind of gap). The
 * roadmap's own commission text ("controlsExpanded -> panels T-group
 * presence") ratifies bringing that same UI-registry-layer affordance
 * into the Vue realization — this module (and `LytNode.vue`'s runtime
 * `presenceOverrides` prop) is where it lives: a real, working toggle at
 * the Vue-component level, honestly NOT a fact the compiled LYT program
 * or its own conformance harness asserts. Disclosed here rather than
 * silently presented as if the `.lyt` encoding already declared it.
 *
 * ── The last-remaining-panel guard ───────────────────────────────────
 * Ports the mockup's N2 fix mechanism, not its code: the last CHECKED
 * release-presence target among the CURRENTLY-ACTIVE target set (see
 * `activeTargets` below) is DISABLED (never silently reverted) —
 * `isOnlyVisible(id)` is the disable predicate a consuming template
 * binds to `:disabled` AND uses to pick the explanatory `:title`.
 *
 * `activeTargets` excludes `boardRail` when `railStyle === 'popover'`:
 * in that style the boardRail LYT leaf's grid track is unconditionally
 * collapsed regardless of `lytPresence.boardRail` (App.vue's own
 * presence-override computation), so `boardRail`'s checkbox state is not
 * a grid-presence fact in that style at all — excluding it from the
 * guard's own accounting matches that (a hypothetical
 * `controlPanel`+`previewBoard` both-off state must still be guarded
 * even though `boardRail`'s stored `lytPresence.boardRail` value is
 * irrelevant to the grid in popover style).
 *
 * ADR-0003 band: 2 (chrome-coupled — reads/writes the LYT presence menu's
 * own session-state shape; no Go/engine vocabulary).
 *
 * License: Public Domain (The Unlicense)
 */
import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { store, touchSession } from '../../store';

/** The presence menu's three checkbox targets, in the order the popover
 *  renders them. See this file's header for why not the mockup's seven. */
export const LYT_PRESENCE_TARGETS = ['boardRail', 'previewBoard', 'controlPanel'] as const;
export type LytPresenceTargetId = (typeof LYT_PRESENCE_TARGETS)[number];

/**
 * Fallback default per target — mirrors `lyt-layout.gen.ts`'s own
 * `presenceDefaultVisible` for `boardRail` (path '0') and `previewBoard`
 * (path '2.3.2', was '2.2.2' — M2 stage B2a/B2b's new `A_setup` leaf
 * shifted the tree/panels row from '2.2' to '2.3'), both `false`, and
 * `controlPanel` (path '2.3.1', was '2.2.1')'s `true`. Kept as a literal
 * (not derived by walking `LYT_LANDSCAPE` at
 * runtime) because exactly these three ids are presence-menu targets —
 * see this file's header. `defaults.ts`'s `defaultSessionUI.lytPresence`
 * seeds the SAME triple; this is the one other place it is named (the
 * migration 75 -> 76 fallback for a key a legacy blob never wrote names
 * it a third time, independently, per that migration's own frozen-body
 * discipline — the three literals are intentionally NOT imported from a
 * shared constant across the store/composable boundary, since a shipped
 * migration body must never depend on a runtime module that could change
 * shape later).
 */
export const LYT_PRESENCE_DEFAULT: Record<LytPresenceTargetId, boolean> = {
  boardRail: false,
  previewBoard: false,
  controlPanel: true,
};

export interface LytPresenceMenuTarget {
  readonly id: LytPresenceTargetId;
  readonly visible: boolean;
  readonly disabled: boolean;
}

export interface LytPresenceMenuHandle {
  readonly open: Ref<boolean>;
  readonly toggleMenu: () => void;
  readonly closeMenu: () => void;
  /** Ordered target list for the popover's `v-for`, each already
   *  carrying its resolved `visible`/`disabled` state. */
  readonly targets: ComputedRef<LytPresenceMenuTarget[]>;
  readonly toggle: (id: LytPresenceTargetId) => void;
  readonly railStyle: ComputedRef<'slot' | 'popover'>;
  readonly setRailStyle: (style: 'slot' | 'popover') => void;
}

export function useLytPresenceMenu(): LytPresenceMenuHandle {
  const open = ref(false);

  function toggleMenu(): void {
    open.value = !open.value;
  }
  function closeMenu(): void {
    open.value = false;
  }

  function isVisible(id: LytPresenceTargetId): boolean {
    return store.session.ui.lytPresence[id] ?? LYT_PRESENCE_DEFAULT[id];
  }

  // See file header: boardRail drops out of the guard's own accounting
  // in 'popover' rail style, since its checkbox state is not a grid-
  // presence fact in that style.
  function activeTargetIds(): readonly LytPresenceTargetId[] {
    return store.session.ui.railStyle === 'popover'
      ? LYT_PRESENCE_TARGETS.filter((id) => id !== 'boardRail')
      : LYT_PRESENCE_TARGETS;
  }

  function isOnlyVisible(id: LytPresenceTargetId): boolean {
    const activeVisible = activeTargetIds().filter(isVisible);
    return activeVisible.length === 1 && activeVisible[0] === id;
  }

  const targets = computed<LytPresenceMenuTarget[]>(() =>
    LYT_PRESENCE_TARGETS.map((id) => ({
      id,
      visible: isVisible(id),
      // boardRail's checkbox is meaningless in 'popover' rail style (see
      // header) — disabled there too, distinctly from the guard's own
      // disable (a different reason, same disabled affordance; the
      // template's :title differentiates the two).
      disabled: store.session.ui.railStyle === 'popover' && id === 'boardRail' ? true : isOnlyVisible(id),
    })),
  );

  function toggle(id: LytPresenceTargetId): void {
    // Defensive guard (belt-and-suspenders with the template's own
    // :disabled binding, which is what actually stops the click from
    // ever registering — see file header, "never silently reverted").
    if (store.session.ui.railStyle === 'popover' && id === 'boardRail') return;
    if (isVisible(id) && isOnlyVisible(id)) return;
    store.session.ui.lytPresence = {
      ...store.session.ui.lytPresence,
      [id]: !isVisible(id),
    };
    touchSession();
  }

  const railStyle = computed<'slot' | 'popover'>(() => store.session.ui.railStyle);
  function setRailStyle(style: 'slot' | 'popover'): void {
    store.session.ui.railStyle = style;
    touchSession();
  }

  return { open, toggleMenu, closeMenu, targets, toggle, railStyle, setRailStyle };
}
