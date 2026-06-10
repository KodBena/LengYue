/**
 * src/lib/keybindings.ts
 * Generic keybindings substrate — catalog-agnostic machinery.
 *
 * The substrate knows nothing about what the actions *do*: it
 * defines the declaration shape (`KeybindingActionDecl`) and the
 * pure helpers that operate over any catalog of declarations.
 * The application's actual action catalog — the `ACTIONS` id
 * const and `KEYBINDINGS_REGISTRY`, whose handlers dispatch
 * domain verbs — lives at `src/composables/keybindings-catalog.ts`
 * and is passed *into* this module's functions as input
 * (split per the 2026-06-10 history-lessons audit §3.16,
 * work-status item `keybindings-substrate-catalog-split`).
 *
 * Pieces:
 *
 *   - `KeybindingActionDecl` — one rebindable action. `id` is a
 *     branded `KeybindingActionId`, stable across reshuffles
 *     (the i18n label can change; the id is the contract with
 *     persisted user overrides on `AppSettings.keybindings`).
 *     `enabledWhen` is a catalog-supplied predicate — the
 *     substrate never interprets it (no gate vocabulary is baked
 *     in here; the catalog names its own predicates).
 *   - `effectiveKey(action, overrides)` — resolves the live
 *     binding. The user's overrides live at
 *     `store.profile.settings.keybindings` as a sparse
 *     `Partial<Record<KeybindingActionId, string | null>>`
 *     (absence = use the declaration default; explicit null =
 *     user unbound).
 *   - `normalizeKey(key)` — letter-key case folding shared by
 *     the dispatcher's lookup and the capture editor's writes.
 *   - `validateKeybindingsRegistry(registry)` — ship-time
 *     conflict check over a supplied catalog; throws per
 *     ADR-0002.
 *
 * Dispatch itself lives in `src/composables/useUserIORegistry.ts`;
 * the editor-state helpers in `src/lib/keybindings-capture.ts`.
 * Design note: `docs/archive/notes/design/keybindings-plan.md`.
 *
 * License: Public Domain (The Unlicense)
 */

import type { KeybindingActionId } from '../types';

// ── Types ─────────────────────────────────────────────────────

/**
 * Dispatchability predicate for an action. Supplied by the
 * catalog (which closes over whatever host state its gate
 * needs — reactive store reads happen at call time); the
 * substrate and the dispatcher only ever *call* it. Pure —
 * re-call on each dispatch.
 */
export type KeybindingEnabledPredicate = () => boolean;

/**
 * Dispatch mode for a keybinding action.
 *
 *   - `'immediate'` for toggles / one-shot actions; fires
 *     synchronously per keydown (one key = one toggle).
 *   - `'coalesced'` for nav-style actions; the dispatcher
 *     rAF-coalesces against OS key-repeat so heavy downstream
 *     work can't back-pressure the input queue. Established in
 *     perf Fix #1 (see the worklog at
 *     `docs/worklog/2026-05-27-perf-fix1-raf-coalesce-keydown.md`).
 */
export type KeybindingDispatchMode = 'immediate' | 'coalesced';

export interface KeybindingActionDecl {
  readonly id: KeybindingActionId;
  /** i18n key for the user-visible action label (short imperative). */
  readonly labelKey: string;
  /** i18n key for a sentence-length description (rendered in tooltips / details rows). */
  readonly descriptionKey: string;
  /** Default key as shipped; `null` for actions that ship unbound. */
  readonly defaultKey: string | null;
  readonly dispatchMode: KeybindingDispatchMode;
  /** Catalog-supplied gate; the substrate stays predicate-agnostic. */
  readonly enabledWhen: KeybindingEnabledPredicate;
  /** Pure side-effecting handler. Reads reactive state at fire time. */
  readonly handler: () => void;
}

// ── effectiveKey ─────────────────────────────────────────────

/**
 * Resolve the effective key for an action given the user's
 * overrides. Returns `null` when the action is unbound (either by
 * default OR by explicit user override) — the dispatcher should
 * skip unbound actions; no keydown ever triggers them.
 */
export function effectiveKey(
  action: KeybindingActionDecl,
  overrides: Partial<Record<KeybindingActionId, string | null>>,
): string | null {
  if (action.id in overrides) return overrides[action.id] ?? null;
  return action.defaultKey;
}

// ── normalizeKey ─────────────────────────────────────────────

/**
 * Letter keys (A–Z / a–z) normalise to lowercase for both
 * registration and lookup, so a binding to `m` triggers on
 * `event.key === 'm'` AND `event.key === 'M'` (Shift held).
 * Non-letter keys (Arrow*, Home, End, ' ', etc.) pass through
 * unchanged.
 *
 * Used by `useUserIORegistry` at lookup time and by the capture
 * helper at write time, so what the user sees recorded matches
 * what the dispatcher will dispatch on.
 */
export function normalizeKey(key: string): string {
  if (key.length === 1 && /^[a-zA-Z]$/.test(key)) return key.toLowerCase();
  return key;
}

// ── Registry validation ──────────────────────────────────────

/**
 * Defensive ship-time check over a supplied catalog: every
 * action's id is unique, and no two actions claim the same
 * `defaultKey`. Throws per ADR-0002 on conflict (a shipped
 * registry with conflicts is a developer bug, not a user-facing
 * condition). Called once at app bootstrap from
 * `useAppBootstrap`, which passes the application catalog.
 */
export function validateKeybindingsRegistry(
  registry: ReadonlyArray<KeybindingActionDecl>,
): void {
  const seenIds = new Set<KeybindingActionId>();
  const seenDefaultKeys = new Map<string, KeybindingActionDecl>();
  for (const action of registry) {
    if (seenIds.has(action.id)) {
      throw new Error(`[keybindings] duplicate action id: ${action.id}`);
    }
    seenIds.add(action.id);
    if (action.defaultKey !== null) {
      const existing = seenDefaultKeys.get(action.defaultKey);
      if (existing !== undefined) {
        throw new Error(
          `[keybindings] default-key conflict: "${action.defaultKey}" bound to both ${existing.id} and ${action.id}`,
        );
      }
      seenDefaultKeys.set(action.defaultKey, action);
    }
  }
}
