/**
 * src/state/lyt-capability-registry.ts
 *
 * METAMODEL WAVE, item 4 (ledger row 2157/2189, branch
 * lyt-model-loop-experiment, NOT merged without ratification): a typed
 * action-capability IR — DATA ONLY, covering the toolbar's action
 * elements. The census below is derived from a DIRECT read of
 * `ToolbarEngineControls.vue`'s own `emit(...)` calls and
 * `ToolbarAppCluster.vue`'s own `@click`/child-component list (not the
 * domain-model consult's secondhand census), the same "verify, don't
 * transcribe" posture item 2b's registry sweep takes.
 *
 * Why this exists (the commission's own framing): the loop and a future
 * model wave need to SELECT a capability's realization — a button in a
 * cluster, a menu-bar entry, a popover trigger — DECLARATIVELY, per
 * class point, rather than each realization being baked into which Vue
 * component happens to render it. This file is that seam: it names each
 * capability once, names what activity state (if any) it requires, and
 * declares which realization KINDS are legitimate candidates for it —
 * `menu-path` is a legitimate candidate for a small class, per the
 * commission's own instruction, even though NO menu bar exists anywhere
 * in this codebase yet (arc-4/M3 territory, explicitly out of this
 * wave's scope).
 *
 * PETRIFICATION GUARD (the commissioner's own caveat, carried verbatim
 * into this file's own discipline): this IR is DATA + MAPPINGS, never a
 * baked component grouping. `LYT_CAPABILITY_REALIZATION` selects a
 * realization KIND per (class point, capability) — it does not itself
 * construct or group any chrome. No new Vue component is authored or
 * implied by this file; `ToolbarEngineControls.vue`/`ToolbarAppCluster.vue`
 * (M2 stage B2b boot-restoration wiring retired `ToolbarEngineCluster.vue`
 * in favour of four independent leaves — see `lyt-widget-registry.ts`'s
 * own header — `ToolbarEngineControls.vue` is its direct successor for
 * the capabilities this census covers) are UNCHANGED by this wave and
 * continue to render every capability
 * below as a `button-cluster` today (the realization the data below
 * selects for both existing class points), exactly as they did before
 * this file existed. A future wave that wires a realization-selection
 * mechanism reads this data; it does not need to touch this file's own
 * shape to do so.
 *
 * License: Public Domain (The Unlicense)
 */

/** A realization KIND — how a capability's affordance is actually
 *  rendered. `menu-bar` is not yet a name any component in this codebase
 *  answers to; it is declared here as a legitimate candidate per the
 *  commission's own instruction, not as a promise it exists. */
export type LytCapabilityRealizationKind = 'button-cluster' | 'menu-path' | 'popover';

export interface LytCapabilityEntry {
  readonly id: string;
  /** What this capability DOES, in one clause — the "what it does" the
   *  commission's own item 4 wording names. */
  readonly description: string;
  /** The activity state this capability requires to be MEANINGFUL — not
   *  necessarily to MOUNT (several of these render disabled/greyed
   *  rather than unmounting; that distinction is a realization decision
   *  this IR does not carry). `null` means "no activity-state
   *  precondition" — always meaningful. Verified per capability against
   *  the component's own source, not assumed from the cluster it sits
   *  in (`connect`/`disconnect` and `mint-card` sit in the SAME
   *  component but require different states). */
  readonly requiredActivityState: string | null;
  /** Which realization KINDS are legitimate candidates for this
   *  capability — declarative, never a live mapping to a component. The
   *  order carries no ranking; a future realization-selection mechanism
   *  reads this as a set. */
  readonly realizationCandidates: readonly LytCapabilityRealizationKind[];
}

/**
 * The toolbar's action-element census. Derived by reading:
 *   - `ToolbarEngineControls.vue`'s own `emit('mint-card')` /
 *     `emit('open-learn-path')` / `emit('open-play')` / `onMatchClick`
 *     (toggles `match`/`stopMatch`) / `emit('toggle-engine')` (toggles
 *     `connect`/`disconnect`) — the SESSION-ACTIONS cluster (`A_engine`).
 *   - `ToolbarAppCluster.vue`'s own two direct `@click` buttons
 *     (`openFileDialog`, `downloadActiveBoard`) plus its four child
 *     trigger components (`ToolbarEngineUri`, `ToolbarSliderPopover`,
 *     `PboPopover`, `LocalePicker`) and `SetupPaletteTrigger` — the
 *     FILE + ENVIRONMENT cluster (`A_app`).
 */
export const LYT_CAPABILITY_REGISTRY: Readonly<Record<string, LytCapabilityEntry>> = {
  'mint-card': {
    id: 'mint-card',
    description: 'Mint a spaced-repetition card from the current tree selection.',
    requiredActivityState: null,
    realizationCandidates: ['button-cluster', 'menu-path'],
  },
  'open-learn-path': {
    id: 'open-learn-path',
    description: 'Open the "learn this path" on-demand analysis walk.',
    requiredActivityState: null,
    realizationCandidates: ['button-cluster', 'menu-path'],
  },
  'open-play': {
    id: 'open-play',
    description: 'Open the play-vs-engine session modal.',
    requiredActivityState: 'connected',
    realizationCandidates: ['button-cluster', 'menu-path'],
  },
  'toggle-match': {
    id: 'toggle-match',
    description: 'Start or stop an engine match (the button label swaps match/stopMatch).',
    requiredActivityState: 'connected',
    realizationCandidates: ['button-cluster', 'menu-path'],
  },
  'toggle-engine-connection': {
    id: 'toggle-engine-connection',
    description: 'Connect or disconnect the engine (the button label swaps connect/disconnect).',
    requiredActivityState: null,
    realizationCandidates: ['button-cluster', 'menu-path'],
  },
  'load-sgf': {
    id: 'load-sgf',
    description: 'Open the file dialog and load an SGF into the active board.',
    requiredActivityState: null,
    realizationCandidates: ['button-cluster', 'menu-path'],
  },
  'save-sgf': {
    id: 'save-sgf',
    description: 'Download the active board as an SGF file.',
    requiredActivityState: 'boardLoaded',
    realizationCandidates: ['button-cluster', 'menu-path'],
  },
  'engine-uri-edit': {
    id: 'engine-uri-edit',
    description: "Edit the engine proxy's connection URI (display/input toggle).",
    requiredActivityState: null,
    realizationCandidates: ['button-cluster', 'popover', 'menu-path'],
  },
  'sliders-popover': {
    id: 'sliders-popover',
    description: 'Open the analysis-environment sliders popover (visits/sample-count knobs).',
    requiredActivityState: null,
    realizationCandidates: ['button-cluster', 'popover'],
  },
  'pbo-popover': {
    id: 'pbo-popover',
    description: 'Open the per-query overrides configuration popover.',
    requiredActivityState: null,
    realizationCandidates: ['button-cluster', 'popover'],
  },
  'locale-picker': {
    id: 'locale-picker',
    description: 'Open the UI locale selection menu.',
    requiredActivityState: null,
    realizationCandidates: ['button-cluster', 'popover', 'menu-path'],
  },
  'setup-toggle': {
    id: 'setup-toggle',
    description: "Toggle the setup-tool palette's own presence band (A_setup) open/closed.",
    requiredActivityState: 'boardLoaded',
    realizationCandidates: ['button-cluster', 'popover'],
  },
};

/**
 * The seven capabilities `ToolbarAppCluster.vue` realizes — the membership
 * of the `A_app` leaf, read off that component's own template (two direct
 * `@click` buttons plus its four child trigger components, one of which is
 * `SetupPaletteTrigger`). Named once here because the `demoted` selection
 * below is exactly "the A_app set moves; nothing else does", and spelling
 * that as a literal in two places is the duplication ADR-0012 P1 forbids.
 *
 * Every member declares `menu-path` OR `popover` among its own
 * `realizationCandidates` above — `sliders-popover`, `pbo-popover` and
 * `setup-toggle` are popover TRIGGERS whose trigger button is what moves,
 * their popovers opening from wherever that button now sits.
 */
export const A_APP_CAPABILITY_IDS = [
  'load-sgf',
  'save-sgf',
  'engine-uri-edit',
  'sliders-popover',
  'pbo-popover',
  'locale-picker',
  'setup-toggle',
] as const;

/**
 * Per-class-point realization SELECTION, as data — the seam the loop and
 * a future model wave read to decide WHICH candidate a class point
 * actually uses, without either one baking a component grouping. Both
 * declared class points select `button-cluster` for every capability
 * today, matching this wave's own petrification guard: nothing in
 * `ToolbarEngineControls.vue`/`ToolbarAppCluster.vue` reads this map, so
 * changing an entry here has ZERO effect on the running app until a
 * future wave wires a consumer — this table is the declared SELECTION,
 * not yet the mechanism that acts on it.
 */
export const LYT_CAPABILITY_REALIZATION: Readonly<
  Record<string, Readonly<Record<string, LytCapabilityRealizationKind>>>
> = {
  landscape: Object.fromEntries(
    Object.keys(LYT_CAPABILITY_REGISTRY).map((id) => [id, 'button-cluster' as const]),
  ),
  portrait: Object.fromEntries(
    Object.keys(LYT_CAPABILITY_REGISTRY).map((id) => [id, 'button-cluster' as const]),
  ),
  /**
   * LOOP ITERATION 11 / ARC 4 ROUND 4 (L15, ledger rows
   * 2037/2066/2107/2157/2241/2259 — branch lyt-model-loop-experiment, NOT
   * merged without ratification): the first class point at which this
   * table's `menu-path` candidate is a LIVE selection rather than a
   * declared possibility.
   *
   * It is not a screen class in the LYT sense — it is the state EITHER
   * class enters when its toolbar band is granted less than `A_app`'s own
   * declared `@demote(h 616px)` threshold. The seven capabilities `A_app`
   * realizes move to `menu-path` there (`LytPresenceMenu.vue` mounts the
   * SAME `ToolbarAppCluster` inside its popover); everything `A_engine`
   * and `I_metrics` realize stays a `button-cluster`, because both leaves
   * declare `activity sustained` and L15 forbids demoting content the
   * encoding has not ranked `occasional`.
   *
   * The petrification guard above still holds in the sense it was written:
   * nothing here constructs or groups chrome, and no component reads this
   * table to decide anything. It remains DATA — the declared answer to
   * "which shape does this capability take in this state", now with a
   * state where the answer is genuinely not `button-cluster`, verified
   * against the running app rather than reserved for a future consumer.
   * `setup-toggle` moves with the rest because its TRIGGER lives in
   * `A_app` (the palette's own band, `A_setup`, is a separate
   * `@toggle(user, release)` slot and does not demote).
   */
  demoted: Object.fromEntries(
    Object.keys(LYT_CAPABILITY_REGISTRY).map((id) => [
      id,
      // Widening cast, sound: A_APP_CAPABILITY_IDS is a `readonly [...] as
      // const` literal-string tuple; `.includes` on the narrow tuple type
      // would only accept one of its own literal members, but `id` here is
      // a general `string` (Object.keys' own return type) — the array's
      // actual runtime membership check is unaffected by the widening.
      (A_APP_CAPABILITY_IDS as readonly string[]).includes(id)
        ? ('menu-path' as const)
        : ('button-cluster' as const),
    ]),
  ),
};
