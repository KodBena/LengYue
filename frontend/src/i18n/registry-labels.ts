/**
 * src/i18n/registry-labels.ts
 *
 * S9 (component-shoddiness audit, 2026-08-21): RegistryEditor.vue rendered
 * every leaf/branch key VERBATIM — `activeTab`, `moveFilterThreshold`,
 * `LYTPRESENCE` (the uppercase-transformed `lytPresence` group heading),
 * `PVANIMATION`, `OVERLAYLAYERS`, `OWNERSHIP` — with no human-readable
 * label. `PATH_LABELS` is the same "dot-joined path relative to the
 * editor's mount root → i18n key" convention `RegistryEditor.vue`'s own
 * `PATH_ENUMS`/`PATH_TOOLTIPS` tables already use (this file's sibling
 * data, not duplicated logic — ADR-0012 P10, content is data).
 *
 * Coverage: every key under `store.session.ui` (`defaults.ts`'s
 * `defaultSessionUI`) — the "Session (UI)" registry tab the finding
 * named. The "Advanced Registry" tab (`store.profile.settings`) is
 * NOT covered here — that tab wasn't part of the S9 finding, and per
 * ADR-0002 an unmapped key is not silently prettied up with a guessed
 * label; it falls through to `resolveLabel`'s loud fallback in
 * `RegistryEditor.vue` (raw key shown, once-per-path `console.warn`).
 * Extending coverage to the Advanced Registry tab is a natural future
 * pass, not folded in here (minimal-touch, ADR-0004).
 *
 * An unmapped path's fallback is the raw key itself, fed straight to
 * `$t(...)` at the call site (`RegistryEditor.vue`'s `labelKey`) — the
 * app's own `i18n/index.ts` already turns an unresolvable `$t` key into
 * exactly the "show the raw text AND log it" loud fallback ADR-0002
 * asks for (`missingWarn: true`), so no second dedup/warn mechanism is
 * minted here.
 *
 * License: Public Domain (The Unlicense)
 */

/** Dot-joined path (relative to the RegistryEditor's mount root) → i18n
 *  key. Values live in `src/locales/en.json` (and siblings) under the
 *  `registry.label.*` namespace. */
export const PATH_LABELS: Readonly<Record<string, string>> = {
  activeTab:                              'registry.label.activeTab',
  lytPresence:                            'registry.label.lytPresence',
  'lytPresence.boardRail':                'registry.label.boardRail',
  'lytPresence.previewBoard':             'registry.label.previewBoard',
  railStyle:                              'registry.label.railStyle',
  treeExpanded:                           'registry.label.treeExpanded',
  systemLogExpanded:                      'registry.label.systemLogExpanded',
  moveFilterThreshold:                    'registry.label.moveFilterThreshold',
  moveFilterExpression:                   'registry.label.moveFilterExpression',
  analysisLayout:                         'registry.label.analysisLayout',
  showMoveSuggestions:                    'registry.label.showMoveSuggestions',
  showStoneMoveNumbers:                   'registry.label.showStoneMoveNumbers',
  loadSgfAtLastNode:                      'registry.label.loadSgfAtLastNode',
  pvAnimation:                            'registry.label.pvAnimation',
  'pvAnimation.mode':                     'registry.label.pvAnimationMode',
  'pvAnimation.stepDelayMs':              'registry.label.pvAnimationStepDelayMs',
  'pvAnimation.windowDurationMs':         'registry.label.pvAnimationWindowDurationMs',
  'pvAnimation.cycle':                    'registry.label.pvAnimationCycle',
  'pvAnimation.pvOpacity':                'registry.label.pvAnimationOpacity',
  'pvAnimation.annotation':               'registry.label.pvAnimationAnnotation',
  overlayLayers:                          'registry.label.overlayLayers',
  'overlayLayers.ownership':              'registry.label.ownership',
  'overlayLayers.ownership.continuous':   'registry.label.ownershipContinuous',
  'overlayLayers.ownership.dots':         'registry.label.ownershipDots',
  'overlayLayers.ownership.liveness':     'registry.label.ownershipLiveness',
  activeCardSetId:                        'registry.label.activeCardSetId',
  cardsContextIds:                        'registry.label.cardsContextIds',
  cardsContextGameSourceOrdinals:         'registry.label.cardsContextGameSourceOrdinals',
  qeuboToolbarView:                       'registry.label.qeuboToolbarView',
  deltaViewMode:                          'registry.label.deltaViewMode',
  boardVariations:                        'registry.label.boardVariations',
  showActiveNextMove:                     'registry.label.showActiveNextMove',
  showTranspositionRings:                 'registry.label.showTranspositionRings',
  watchdogColorTransition:                'registry.label.watchdogColorTransition',
  forestNav:                              'registry.label.forestNav',
  'forestNav.expanded':                   'registry.label.forestNavExpanded',
  'forestNav.selection':                  'registry.label.forestNavSelection',
  cardTreeNav:                            'registry.label.cardTreeNav',
  moveDeltaAnnotation:                    'registry.label.moveDeltaAnnotation',
  settingsTabsOrientation:                'registry.label.settingsTabsOrientation',
  showGhostStone:                         'registry.label.showGhostStone',
};
