/**
 * src/store/profile-owner.ts
 *
 * Owner module for the `store.profile` subtree — the persisted
 * user-profile document (settings, card sets, qEUBO bookmarks).
 * Work-status item `settings-profile-mutator-owner`: the follow-on
 * the PR #382 arc filed when `store.profile` was fenced (ten
 * annotated direct-write exemptions) but not owned, while the
 * majority write shape — aliased generic-path writes the
 * `local/store-write-needs-owner` lint cannot see — stayed
 * unguarded.
 *
 * Why an owner module (the `services/engine-connection.ts`
 * precedent, ADR-0011 Rule 4): a net over a multi-writer slot must
 * quantify over the writer CLASS, not enumerate instances. The
 * profile's writers arrive in three shapes, and each gets one verb
 * that takes the write as data rather than enumerating leaves:
 *
 *   - `mutateProfile(fn)` — the named mutator for statically-known
 *     writes (the `mutateBoard` / `mutateReviewSession` shape).
 *     Covers every in-place form: leaf assignment, keyed-record
 *     insert/delete, array push/splice. Fully typed against
 *     `ProfileState`, so a typo'd path is a compile error rather
 *     than a silently-created stray leaf.
 *   - `updateProfileAt(path, value)` — the dynamic path-based seam
 *     for the Settings registry editors, carrying `updateRegistry`'s
 *     silent-create / any-value contract verbatim (that calibration
 *     is deliberate and editor-load-bearing; see `lib/utils.ts`).
 *   - `writeStoreKnobValue(knobId, vector, ctx)` — the single
 *     store-root supplier for the knob substrate (`lib/knobs.ts`
 *     stays a pure root-parameterised library; only this owner hands
 *     it the live store).
 *
 * Scope notes, recorded honestly:
 *
 *   - `resetWorkspace` / `updateFromRemote` (wholesale profile
 *     replacement on identity flip / hydration) stay in
 *     `store/index.ts`, the subtree's other enumerated owner file.
 *   - Knob output paths are profile-majority but two seeded knobs
 *     target `session.ui.*` leaves (`display.move-filter-threshold`,
 *     `display.pv-fade-ms`). `writeStoreKnobValue` is therefore
 *     honestly a GlobalStore-root knob writer, homed here because
 *     the registry it dispatches over is profile state and the
 *     owner is the sanctioned root supplier; the session-targeting
 *     decls ride the same seam.
 *   - Enforcement (ADR-0011 Rule 1): direct dotted-path writes AND the
 *     two aliased generic-machinery shapes — `updateRegistry` over a
 *     `store.profile` root, `writeKnobValue`/`writeKnob` with the
 *     `store` root — are a single build/CI gate via
 *     `local/store-write-needs-owner`. (2026-06-11, work-status item
 *     `profile-owner-scope-analysis-net`: the machinery shapes moved
 *     from the separate `no-restricted-syntax`
 *     PROFILE_ALIASED_WRITE_SELECTORS into the rule's `aliasedWrites`
 *     config, gaining scope analysis — a renamed import and a one-hop
 *     intermediate-variable root are now resolved, not name-matched.
 *     This owner module no longer carries inline eslint-disables: the
 *     rule recognizes it via the profile subtree's `owners` list.)
 *     A two-hop re-alias or a reassigned root binding through an
 *     intermediate variable remains review's to catch — the lint
 *     family's named gap, not closed here.
 *
 * Persistence observability: the profile verbs (`mutateProfile`,
 * `updateProfileAt`) mutate the same deep reactive object graph the
 * direct writes did, so SyncService's deep `store.profile` watch
 * observes them identically — no version counter is needed for the
 * profile subtree. `writeStoreKnobValue` is the one exception: the
 * knob seam may target `session.ui.*` leaves (two seeded knobs do),
 * and SyncService watches `store.session` via the `sessionVersion`
 * counter rather than a deep watch (the per-board session dicts made
 * a deep `session` traversal O(open-board count) — see
 * `sessionVersion` in `store/index.ts`). So `writeStoreKnobValue`
 * bumps `touchSession()` to keep session-targeting knob writes
 * observable. The integration contract is pinned by
 * `tests/integration/profile-owner.test.ts`.
 *
 * License: Public Domain (The Unlicense)
 */

import { store, touchSession } from './index';
import { updateRegistry } from '../lib/utils';
import { writeKnobValue } from '../lib/knobs';
import type { KnobId, ProfileState, WriteContext, WriteResult } from '../types';

/**
 * Named mutator for the profile subtree. `fn` receives the live
 * deep-reactive `store.profile` and mutates it in place — identical
 * write semantics (object identity, fine-grained dep firing, deep
 * watch observability) to the direct writes it replaces. Use this
 * for every statically-known write; use `updateProfileAt` only when
 * the path genuinely arrives as data (the registry editors).
 */
export function mutateProfile(fn: (profile: ProfileState) => void): void {
  fn(store.profile);
}

/**
 * Dynamic path-based profile write — the Settings registry editors'
 * seam (`SettingsTab.vue`'s `update` events carry `{path, value}`).
 * Path segments are relative to `store.profile` (callers prefix
 * `'settings'` where the editor is settings-rooted).
 *
 * Contract is `updateRegistry`'s, unchanged: intermediate objects
 * are silently created, any value type is accepted, an empty path
 * is a no-op. That tolerant calibration is deliberately different
 * from `lib/knobs.ts`'s fail-loud walkers and is load-bearing for
 * the editors (adding a new `parameter_meta` entry creates its
 * path) — see the calibration note in `lib/utils.ts`.
 */
export function updateProfileAt(path: readonly string[], value: unknown): void {
  // Sanctioned root-supplier site: this owner is the one module that may
  // hand a store.profile root to the generic path writer. No inline
  // eslint-disable is needed — the aliased-write guard now lives inside
  // the store-write-needs-owner rule (2026-06-11, work-status item
  // profile-owner-scope-analysis-net), which recognizes this file via the
  // profile subtree's `owners` list, the same mechanism that exempts the
  // store's own direct writes. (Previously a no-restricted-syntax disable.)
  updateRegistry(store.profile, [...path], value);
}

/**
 * Knob-substrate write against the live GlobalStore: dispatches
 * `knobId` through the registry at `store.profile.settings.knobs`
 * with the store as path-walk root, so the substrate's claim-policy
 * machinery (`lib/knobs.ts::writeKnobValue`) engages unchanged.
 * Returns the substrate's `WriteResult` verbatim — refusals are the
 * caller's to surface (or to ignore where the widget re-reads, as
 * `KnobSlider` does).
 */
export function writeStoreKnobValue(
  knobId: KnobId,
  inputVector: readonly number[],
  ctx: WriteContext,
): WriteResult {
  // Sanctioned root-supplier site: the one module that hands the live
  // store root to the knob substrate. No inline eslint-disable needed —
  // the aliased-write guard is the store-write-needs-owner rule's
  // `aliasedWrites` leg, which exempts this owner file via its `owners`
  // list (same as updateProfileAt above; previously a no-restricted-syntax
  // disable).
  const result = writeKnobValue(store, store.profile.settings.knobs, knobId, inputVector, ctx);
  // Two seeded knobs target `session.ui.*` leaves
  // (`display.move-filter-threshold` → `session.ui.moveFilterThreshold`,
  // `display.pv-fade-ms` → `session.ui.pvAnimation.fadeDurationMs`). Those
  // writes mutate `store.session`, which SyncService no longer deep-watches
  // — bump the session counter so a session-targeting knob write still
  // schedules a save. Profile-targeting knobs are already caught by the
  // profile deep watch; the extra bump there is a harmless redundant
  // schedule (the same debounce slot the profile change already occupies),
  // and bumping unconditionally keeps this seam complete without
  // re-deriving each decl's target subtree here. A refused write
  // (claim-policy rejection) also bumps — vacuously harmless: no leaf
  // changed, so the debounced PUT just re-sends identical state, the
  // existing last-write-wins contract.
  touchSession();
  return result;
}
