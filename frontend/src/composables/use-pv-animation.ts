/**
 * src/composables/use-pv-animation.ts
 * Composable for animating a Principal Variation (PV) stone sequence.
 *
 * Supports three rendering modes, selected via PvConfig.mode:
 *
 *   'instant'    — All PV stones appear immediately with move-number labels.
 *
 *   'sequential' — Stones are revealed one by one, each after `stepDelayMs`.
 *                  Good for players who want to "read" the line at their own pace.
 *
 *   'window'     — Each stone fades in, holds for `windowDurationMs`, then fades
 *                  out before the next appears. Inspired by flash-training techniques
 *                  where brief exposure to a position builds pattern recognition.
 *                  Fade is implemented via CSS transitions (set in the rendering layer)
 *                  so the composable only needs to toggle opacity 0↔1 at the right times.
 *
 * Usage:
 *   const { startPv, stopPv, displayStones, cfg } = usePvAnimation({ mode: 'sequential', stepDelayMs: 300 });
 *   // On hover: startPv(pvMoves)
 *   // On leave: stopPv()             ← instant, no animation
 *
 * License: Public Domain (The Unlicense)
 */

import { ref, computed, onUnmounted } from 'vue';
import type { StoneColor } from '../types';

// ─── Public types ─────────────────────────────────────────────────────────────

export type PvMode = 'instant' | 'sequential' | 'window';


export interface PvConfig {
  mode: PvMode;
  stepDelayMs?: number;
  windowDurationMs?: number;
  fadeDurationMs?: number;
  /** Repeat the window animation indefinitely (smooth loop, no hard restart) */
  cycle?: boolean;
  /** Overall opacity of PV stones (0–1). Useful for translucent look. */
  pvOpacity?: number;
  /** How PV stones are numbered */
  annotation?: 'none' | 'from1' | 'fromCurrent';
}

/** A single move in a PV sequence, ready for rendering. */
export interface PvMove {
  x: number;
  y: number;
  color: StoneColor;
  /** 1-indexed position in the PV; used as the displayed move number. */
  moveNumber: number;
}

/** A PvMove augmented with a resolved opacity in [0, 1] for the current frame. */
export interface PvStoneDisplay extends PvMove {
  opacity: number;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULTS = {
  stepDelayMs: 350,
  windowDurationMs: 600,
  fadeDurationMs: 150,
  cycle: false,
  pvOpacity: 1,
  annotation: 'fromCurrent' as const,
} as const;

// ─── Composable ───────────────────────────────────────────────────────────────

export function usePvAnimation(config: PvConfig = { mode: 'instant' }) {
  // Merge user config with defaults; cfg is stable for the lifetime of this instance.
  const cfg: Required<PvConfig> = { ...DEFAULTS, ...config };

  // ── State ──────────────────────────────────────────────────────────────────

  const pvMoves = ref<PvMove[]>([]);
  const revealedCount = ref(0);
  const litStones = ref(new Set<number>());
  const timers: ReturnType<typeof setTimeout>[] = [];

  // ── Helpers ────────────────────────────────────────────────────────────────

  function clearTimers(): void {
    timers.forEach(clearTimeout);
    timers.length = 0;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  function startPv(moves: PvMove[]): void {
    stopPv();
    pvMoves.value = moves;
    if (moves.length === 0) return;

    switch (cfg.mode) {
      case 'instant':
        revealedCount.value = moves.length;
        break;

      case 'sequential':
        revealedCount.value = 0;
        moves.forEach((_, i) => {
          timers.push(
            setTimeout(() => { revealedCount.value = i + 1; }, cfg.stepDelayMs * i)
          );
        });
        break;

      case 'window':
        revealedCount.value = moves.length;
        litStones.value = new Set();

        const scheduleWindowCycle = () => {
          moves.forEach((move, i) => {
            const fadeInDelay = cfg.stepDelayMs * i;
            timers.push(
              setTimeout(() => {
                litStones.value = new Set([...litStones.value, move.moveNumber]);
              }, fadeInDelay)
            );

            const fadeOutDelay = fadeInDelay + cfg.fadeDurationMs + cfg.windowDurationMs;
            timers.push(
              setTimeout(() => {
                const next = new Set(litStones.value);
                next.delete(move.moveNumber);
                litStones.value = next;
              }, fadeOutDelay)
            );
          });

          // Schedule next cycle exactly when the last stone of this cycle fades out
          const cycleDuration = (moves.length - 1) * cfg.stepDelayMs + cfg.fadeDurationMs + cfg.windowDurationMs;
          if (cfg.cycle && cycleDuration > 0) {
            timers.push(setTimeout(scheduleWindowCycle, cycleDuration));
          }
        };

        scheduleWindowCycle();
        break;
    }
  }

  function stopPv(): void {
    clearTimers();
    pvMoves.value     = [];
    revealedCount.value = 0;
    litStones.value   = new Set();
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  /** The list of stones to render this frame, each with its resolved opacity. */
  const displayStones = computed<PvStoneDisplay[]>(() => {
    const moves = pvMoves.value;
    if (moves.length === 0) return [];

    const baseOpacity = (m: PvMove) =>
      cfg.mode === 'window' ? (litStones.value.has(m.moveNumber) ? 1 : 0) : 1;

          switch (cfg.mode) {
      case 'instant':
        return moves.map(m => ({ ...m, opacity: baseOpacity(m) * cfg.pvOpacity }));
      case 'sequential':
        return moves
          .slice(0, revealedCount.value)
          .map(m => ({ ...m, opacity: baseOpacity(m) * cfg.pvOpacity }));
      case 'window':
        return moves
          .slice(0, revealedCount.value)
          .map(m => ({ ...m, opacity: baseOpacity(m) * cfg.pvOpacity }));
    }
  });

  onUnmounted(clearTimers);

  return { startPv, stopPv, displayStones, cfg  };
}
