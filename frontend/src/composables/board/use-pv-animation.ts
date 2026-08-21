/**
 * src/composables/board/use-pv-animation.ts
 * Composable for animating a Principal Variation (PV) stone sequence.
 *
 * ── Rendering invariant ────────────────────────────────────────────────────
 * Every move in `pvMoves.value` is rendered as a circle in the DOM with
 * opacity driven by the `visible` reactive set. CSS `transition` is
 * banned (ledger row 1506, no carve-outs) — the opacity swap between 0
 * and 1 snaps instantly, so this composable's only job is to schedule
 * setVisible calls at the right moments for the chosen mode. The
 * previous implementation mixed slice-based reveal (sequential) with
 * opacity-based reveal (window) and gated a (since-purged) CSS
 * transition on mode === 'window', which left sequential and instant
 * modes snapping stones in/out without animation.
 *
 * The `display.pv-fade-ms` knob (`fadeDurationMs`) that used to pad
 * the window mode's fade-out timing and the stopPv-to-DOM-release
 * delay is removed (wiki2-pv-fade-knob): it existed to give the CSS
 * transition above time to interpolate, and became inert dead time
 * once that transition was purged. Window mode now flips a stone
 * invisible immediately at `windowDurationMs` past its fade-in, and
 * `stopPv` releases `pvMoves` synchronously — there is nothing left
 * to wait for.
 *
 * ── Modes ──────────────────────────────────────────────────────────────────
 *   'instant'    — all PV stones fade in together when startPv is called.
 *                  On real-time PV updates during pondering, stones whose
 *                  moveNumber survives into the new packet stay visible
 *                  without re-fading; new moveNumbers fade in.
 *
 *   'sequential' — stones fade in one by one, each at `stepDelayMs` after
 *                  the previous. No real-time update mid-hover (the
 *                  reveal would re-stagger every packet).
 *
 *   'window'     — sliding-window reveal: each stone fades in, holds for
 *                  `windowDurationMs`, fades out. With `cycle: true` the
 *                  pattern repeats. Note that with stepDelayMs <
 *                  windowDurationMs, multiple stones are visible
 *                  simultaneously by design (the "window" is
 *                  windowDurationMs wide, sliding across the line).
 *
 * ── Graceful exit ──────────────────────────────────────────────────────────
 * `stopPv` empties `visible` (the opacity swap to 0 is instant — no CSS
 * transition to wait for) and clears `pvMoves` synchronously so Vue
 * releases the DOM elements right away.
 *
 * License: Public Domain (The Unlicense)
 */

import { computed, onUnmounted, reactive, ref, watchEffect } from 'vue';
import { NEXT_TICK_DEFER_MS } from '../../lib/timing';
import type { PvVariationMove } from '../../engine/board-geometry';

// ─── Public types ─────────────────────────────────────────────────────────────

export type PvMode       = 'instant' | 'sequential' | 'window';
export type PvAnnotation = 'none' | 'from1' | 'fromCurrent';

/**
 * Loose construction-time shape — `mode` required, others optional.
 * Used as the prop type on `MoveSuggestions.vue` so a hand-constructed
 * config (e.g., a future review-mode override) can omit fields and let
 * defaults fill in.
 */
export interface PvConfig {
  mode: PvMode;
  stepDelayMs?: number;
  windowDurationMs?: number;
  cycle?: boolean;
  pvOpacity?: number;
  annotation?: PvAnnotation;
}

/**
 * Persisted shape — every field required. Stored at
 * `UISession.pvAnimation` and edited via the registry editor; aligned
 * with the registry default and the schemaVersion 9→10 backfill.
 */
export type PvAnimationSettings = Required<PvConfig>;

/**
 * A single move in a PV sequence, ready for rendering. Re-exported from
 * the engine layer (`board-geometry.ts::PvVariationMove`) rather than
 * declared here — `BoardSnapshot.pv` (the thumbnail-family field this
 * type also now serves) lives in `engine/`, below `composables/` in this
 * codebase's layering, so the shared shape must be engine-owned. Kept
 * under this module's own established name (`PvMove`) so every existing
 * call site (`MoveSuggestions.vue`, `use-move-suggestions.ts`, `App.vue`)
 * is untouched. Used as the displayed move number AND as the Vue v-for
 * key; stable across packet updates of the same PV line so element reuse
 * works for in-place position updates. */
export type PvMove = PvVariationMove;

/** A PvMove augmented with a resolved opacity in [0, 1] for the current frame. */
export interface PvStoneDisplay extends PvMove {
  opacity: number;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────
//
// Shared with `defaults.ts::defaultSessionUI.pvAnimation` and the
// migration 9→10 backfill. Three sources of truth that must agree;
// updates must land in lockstep.
export const PV_DEFAULTS: PvAnimationSettings = {
  mode: 'instant',
  stepDelayMs: 350,
  windowDurationMs: 600,
  cycle: false,
  pvOpacity: 1,
  annotation: 'from1',
};

// ─── Composable ───────────────────────────────────────────────────────────────

/**
 * `getConfig` is a getter (not a static value) so changes to the
 * underlying source — typically `props.pvConfig` reading from
 * `UISession.pvAnimation` — propagate live without remounting the
 * component. The returned `cfg` is a reactive object: consumers read
 * `cfg.mode`, `cfg.windowDurationMs`, etc. directly, and Vue tracks
 * dependencies through the proxy. Previously the composable accepted
 * a static `PvConfig` and snapshotted it once at call time, which
 * meant a registry change required closing/re-opening the board for
 * the new mode to take effect.
 */
export function usePvAnimation(getConfig: () => PvConfig | undefined = () => undefined) {
  // Reactive cfg; mirrored from `getConfig()` over `PV_DEFAULTS`
  // every time the getter's reactive dependencies change. We use
  // `reactive` (not `computed`) so consumers can read fields directly
  // without `.value` — the existing template and script call sites
  // (`pvCfg.mode`, `pvCfg.windowDurationMs`, ...) keep working.
  const cfg: PvAnimationSettings = reactive({ ...PV_DEFAULTS });
  watchEffect(() => {
    Object.assign(cfg, PV_DEFAULTS, getConfig() ?? {});
  });

  // ── State ──────────────────────────────────────────────────────────────────

  const pvMoves = ref<PvMove[]>([]);
  // moveNumber → "should render at opacity 1"; the opacity swap between
  // 0 and 1 is instant (CSS `transition` is banned, ledger row 1506).
  const visible = ref<Set<number>>(new Set());
  const timers: ReturnType<typeof setTimeout>[] = [];

  // ── Helpers ────────────────────────────────────────────────────────────────

  function clearTimers(): void {
    timers.forEach(clearTimeout);
    timers.length = 0;
  }

  function setVisible(moveNumber: number, value: boolean): void {
    const next = new Set(visible.value);
    if (value) next.add(moveNumber); else next.delete(moveNumber);
    visible.value = next;
  }

  function scheduleWindow(moves: PvMove[]): void {
    moves.forEach((m, i) => {
      // +1ms epsilon: ensures the initial opacity-0 render commits
      // before the flip to opacity-1 on first stone of the cycle —
      // a same-tick 0→1 flip could otherwise coalesce into a single
      // Vue render pass with no intervening opacity-0 frame.
      const fadeInAt = cfg.stepDelayMs * i + 1;
      timers.push(setTimeout(() => setVisible(m.moveNumber, true), fadeInAt));

      const fadeOutAt = fadeInAt + cfg.windowDurationMs;
      timers.push(setTimeout(() => setVisible(m.moveNumber, false), fadeOutAt));
    });

    if (cfg.cycle) {
      const cycleDuration =
        (moves.length - 1) * cfg.stepDelayMs +
        cfg.windowDurationMs;
      if (cycleDuration > 0) {
        // Replace the timer list at the cycle boundary so it doesn't
        // grow unboundedly with each iteration. Per-stone fade timers
        // from this cycle have already fired by then; their references
        // are no longer needed and the next cycle's scheduling supplies
        // its own. (The previous implementation appended to `timers`
        // every cycle without ever clearing fired entries — a leak that
        // grew with hover duration.)
        timers.push(
          setTimeout(() => {
            timers.length = 0;
            scheduleWindow(moves);
          }, cycleDuration)
        );
      }
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  function startPv(moves: PvMove[]): void {
    clearTimers();

    if (moves.length === 0) {
      stopPv();
      return;
    }

    pvMoves.value = moves;

    // Prune visibility to moveNumbers still present in the new line. In
    // 'instant' mode, retained stones stay visible (no fade-flash on
    // ponder-update mid-hover); 'sequential' / 'window' resets to empty
    // because the staged reveal is the whole point.
    const present  = new Set(moves.map(m => m.moveNumber));
    const retained = new Set([...visible.value].filter(n => present.has(n)));

    visible.value = cfg.mode === 'instant' ? retained : new Set();

    switch (cfg.mode) {
      case 'instant':
        moves.forEach(m => {
          if (!retained.has(m.moveNumber)) {
            // Next-tick scheduler — defers visibility flip out of the
            // current synchronous batch so Vue's reactive tracking sees
            // the state change as a separate update cycle. The next-tick
            // defer constant from the timing catalog (`lib/timing`).
            timers.push(setTimeout(() => setVisible(m.moveNumber, true), NEXT_TICK_DEFER_MS));
          }
        });
        break;

      case 'sequential':
        moves.forEach((m, i) => {
          timers.push(
            setTimeout(() => setVisible(m.moveNumber, true), cfg.stepDelayMs * i + NEXT_TICK_DEFER_MS)
          );
        });
        break;

      case 'window':
        scheduleWindow(moves);
        break;
    }
  }

  function stopPv(): void {
    clearTimers();
    // Opacity swap to 0 is instant (no CSS transition to wait for), so
    // both the visibility clear and the DOM release happen in the same
    // tick — nothing left to stage across.
    visible.value = new Set();
    pvMoves.value = [];
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const displayStones = computed<PvStoneDisplay[]>(() =>
    pvMoves.value.map(m => ({
      ...m,
      opacity: (visible.value.has(m.moveNumber) ? 1 : 0) * cfg.pvOpacity,
    }))
  );

  onUnmounted(clearTimers);

  return { startPv, stopPv, displayStones, cfg };
}
