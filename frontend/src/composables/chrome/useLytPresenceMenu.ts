/**
 * src/composables/chrome/useLytPresenceMenu.ts
 *
 * W2 commission (`.claude/dispatch-reports/lyt-vue-realization-roadmap.md`
 * §8 W2 item 1 + ledger row 1743). Logic for the corner presence menu:
 * which LYT leaves/blackboxes are togglable, each one's current
 * checked state, and the rail-style setting the same popover hosts an
 * inline selector for. (This module used to also carry a
 * last-remaining-panel guard, REMOVED — see "The last-remaining-panel
 * guard, and why it's gone" below.)
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
 * ── The last-remaining-panel guard, and why it's gone ─────────────────
 * Originally ported the mockup's own N2 fix mechanism (not its code):
 * the last CHECKED release-presence target among the currently-active
 * target set was DISABLED, so a user could never toggle every target
 * off at once. That guard's PREMISE, inherited from the mockup: the
 * mockup's own `TOGGLE_TARGETS` registers the BOARD itself as one of its
 * seven toggle targets ("Board & Controls") — in that shape, an
 * all-off state genuinely means zero surfaces, board included, so
 * guarding against it is real protection.
 *
 * This module's own header ("Scope: three [now four] targets, not the
 * mockup's seven", above) already narrowed the target set to exclude
 * `B`/`I_board`/`A_board` precisely BECAUSE the board is architecturally
 * always-mounted in the Vue realization (roadmap §5) — no target this
 * module manages can ever hide it. The guard's protected invariant
 * ("never strand the user with zero surfaces") therefore never actually
 * applied to these four targets: the board is unconditionally a
 * surface, so an all-off state among `boardRail`/`previewBoard`/
 * `controlPanel`/`A_setup` leaves the user looking at the board, not at
 * nothing — never the stranding the mockup's guard existed to prevent.
 *
 * REMOVED per finish-pass-2 finding N3
 * (`.claude/dispatch-reports/lyt-finish-pass-2.md` — "the board rail is
 * locked ON by the last-panel guard and consumes 168px... of which a
 * 150x150 board-preview box is measurably empty"; commission
 * `.claude/dispatch-reports/lyt-n2-column-rail.md`). Portrait's own
 * repetition-first default (P1, ledger row 2333) resolves `boardRail`/
 * `controlPanel`/`previewBoard`/`A_setup` all ABSENT — the row this
 * guard was designed to protect never has a genuinely "last" panel to
 * begin with, on a fresh session. But if the persisted `lytPresence` map
 * (a legacy migration, or the user's own prior choices) ever DOES land
 * on exactly one visible target, the guard's stale premise pinned it ON
 * permanently, rendering an empty-content proxy surface (the finding's
 * own 150x150 empty `board-preview` box) the user could never dismiss —
 * exactly backwards from repetition-first's own "board primary" ruling.
 * The presence menu itself remains reachable at all times (an overlay
 * trigger, never gated behind any of its own targets — see
 * `LytPresenceMenu.vue`'s own header), so a user who toggles every
 * target off can always reopen the menu and toggle one back on; nothing
 * becomes permanently unreachable by removing this guard.
 *
 * `railStyle === 'popover'` still disables `boardRail`'s own checkbox
 * for an UNRELATED reason (its grid track is unconditionally collapsed
 * in that style — see `targets` below); that disable path is untouched.
 *
 * ── Presence arc P2b: a 4th target (`A_setup`) + class-aware defaults ──
 * `.claude/dispatch-reports/lyt-p2b-presence-realization.md` item 5. Two
 * additions on top of W2's original three:
 *
 * 1. `A_setup` (the setup-tool-palette leaf, M2 stage boot-restoration)
 *    joins the target tuple — its own compiled `presenceDefaultVisible`
 *    is `false` in BOTH classes (an "off release toggle", matching
 *    `boardRail`/`previewBoard`'s own convention), so `LYT_PRESENCE_DEFAULT`
 *    below carries `false` for it too, uniformly across classes (no
 *    per-class variance to thread for this one target).
 * 2. `controlPanel`'s own compiled default, by contrast, genuinely VARIES
 *    per screen class (P2a: `true` landscape, `false` portrait,
 *    repetition-first) — `LYT_PRESENCE_DEFAULT.controlPanel` below stays
 *    the OLD class-unaware `true` literal (preserved for a caller that
 *    supplies no `classDefaults`, e.g. this file's own pre-existing unit
 *    tests), but a REAL caller (`LytPresenceMenu.vue`, wired from
 *    App.vue's own `activeLytProgramIndex.widgetDefaultVisible` —
 *    ADR-0012 P1, one home for the compiled program's own per-widget
 *    default, not a second derivation of the same fact) passes
 *    `classDefaults`, a per-target override map consulted FIRST, falling
 *    back to `LYT_PRESENCE_DEFAULT` only for a target `classDefaults`
 *    doesn't mention.
 *
 * ── Finish-pass wave A: width-forced demotion disclosure ─────────────
 * (`.claude/dispatch-reports/lyt-wA-width-demotion.md`, F1's "USER
 * SOVEREIGNTY" clause.) `controlPanel`'s resolved presence is now ALSO
 * width-conditional (App.vue's own `lytPresenceOverrides` /
 * `resolveWidthConditionalPresence`) — an explicit user "visible" choice
 * that the currently-available width cannot grant must not silently
 * clip, but it also must not silently pretend the checkbox did nothing:
 * `forcedAbsent` (an optional per-target `Ref`, same shape as
 * `classDefaults`) lets a caller disclose "the user wants this visible
 * but it's currently demoted for width" — `targets[].forcedAbsent`
 * carries that fact through for `LytPresenceMenu.vue`'s own template to
 * render a hint on. The checkbox itself stays fully functional either
 * way (toggling still writes the real preference — it just doesn't take
 * visible effect until the width evaluator agrees).
 *
 * ADR-0003 band: 2 (chrome-coupled — reads/writes the LYT presence menu's
 * own session-state shape; no Go/engine vocabulary).
 *
 * License: Public Domain (The Unlicense)
 */
import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { store, touchSession } from '../../store';

/** The presence menu's checkbox targets, in the order the popover renders
 *  them. See this file's header for why not the mockup's seven, and the
 *  "Presence arc P2b" section for the 4th (`A_setup`). */
export const LYT_PRESENCE_TARGETS = ['boardRail', 'previewBoard', 'controlPanel', 'A_setup'] as const;
export type LytPresenceTargetId = (typeof LYT_PRESENCE_TARGETS)[number];

/**
 * Static fallback default per target, consulted when `classDefaults`
 * (below) supplies nothing for a given id — mirrors `lyt-layout.gen.ts`'s
 * own `presenceDefaultVisible` for `boardRail` (path '0'), `previewBoard`
 * (path '2.3.2', was '2.2.2' — M2 stage B2a/B2b's new `A_setup` leaf
 * shifted the tree/panels row from '2.2' to '2.3'), and `A_setup` itself,
 * all `false`, and `controlPanel` (path '2.3.1', was '2.2.1')'s `true`
 * (LANDSCAPE's own value — see the file header's "Presence arc P2b"
 * section for why this one target additionally needs a class-aware
 * override a real caller supplies). Kept as a literal (not derived by
 * walking `LYT_LANDSCAPE` at runtime) — `defaults.ts`'s
 * `defaultSessionUI.lytPresence` deliberately does NOT seed a matching
 * literal for `controlPanel`/`A_setup` any more (P2b: seeding would bake
 * a class-unaware/stale fact into every new session — see that file's
 * own doc comment); this map is a REALIZATION-layer fallback-of-fallback
 * only, consulted when a persisted key is absent AND (for `controlPanel`)
 * no `classDefaults` override was supplied.
 */
export const LYT_PRESENCE_DEFAULT: Record<LytPresenceTargetId, boolean> = {
  boardRail: false,
  previewBoard: false,
  controlPanel: true,
  A_setup: false,
};

export interface UseLytPresenceMenuOptions {
  /** Per-target override of `LYT_PRESENCE_DEFAULT`, consulted FIRST —
   *  see the file header's "Presence arc P2b" section. Typically the
   *  active screen class's own compiled `presenceDefaultVisible` per
   *  target, threaded from `App.vue`'s `activeLytProgramIndex`. */
  classDefaults?: Ref<Partial<Record<LytPresenceTargetId, boolean>>>;
  /** Per-target "wants visible but currently width-demoted" disclosure —
   *  see the file header's "Finish-pass wave A" section. A target absent
   *  from the map (or the whole option omitted) reads `false`. */
  forcedAbsent?: Ref<Partial<Record<LytPresenceTargetId, boolean>>>;
}

export interface LytPresenceMenuTarget {
  readonly id: LytPresenceTargetId;
  readonly visible: boolean;
  readonly disabled: boolean;
  /** See `UseLytPresenceMenuOptions.forcedAbsent`'s own doc. */
  readonly forcedAbsent: boolean;
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

export function useLytPresenceMenu(options?: UseLytPresenceMenuOptions): LytPresenceMenuHandle {
  const open = ref(false);

  function toggleMenu(): void {
    open.value = !open.value;
  }
  function closeMenu(): void {
    open.value = false;
  }

  // Presence arc P2b — see file header, "Presence arc P2b". A caller's
  // own `classDefaults` wins over the static `LYT_PRESENCE_DEFAULT`
  // fallback for whichever targets it names; a target it doesn't mention
  // (or no `options` at all) falls through unchanged.
  function defaultFor(id: LytPresenceTargetId): boolean {
    return options?.classDefaults?.value[id] ?? LYT_PRESENCE_DEFAULT[id];
  }

  function isVisible(id: LytPresenceTargetId): boolean {
    return store.session.ui.lytPresence[id] ?? defaultFor(id);
  }

  const targets = computed<LytPresenceMenuTarget[]>(() =>
    LYT_PRESENCE_TARGETS.map((id) => ({
      id,
      visible: isVisible(id),
      // boardRail's checkbox is meaningless in 'popover' rail style (see
      // header, "railStyle === 'popover'... unrelated reason") — its own
      // grid track is unconditionally collapsed in that style regardless
      // of this checkbox. The former last-remaining-panel guard's own
      // disable reason is REMOVED (file header, "The last-remaining-
      // panel guard, and why it's gone") — every target is otherwise
      // freely toggleable to fully off.
      disabled: store.session.ui.railStyle === 'popover' && id === 'boardRail',
      forcedAbsent: options?.forcedAbsent?.value[id] ?? false,
    })),
  );

  function toggle(id: LytPresenceTargetId): void {
    // Defensive guard (belt-and-suspenders with the template's own
    // :disabled binding, which is what actually stops the click from
    // ever registering) — boardRail's checkbox is inert in 'popover'
    // rail style. The former last-remaining-panel refusal is REMOVED
    // (file header) — toggling every target off is a valid state; the
    // board is always the surface underneath.
    if (store.session.ui.railStyle === 'popover' && id === 'boardRail') return;
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
