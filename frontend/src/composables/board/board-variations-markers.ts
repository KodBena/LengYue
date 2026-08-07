/**
 * src/composables/board/board-variations-markers.ts
 *
 * Pure derivation of `BoardVariationsOverlay`'s dashed/lettered
 * sibling-variation and active-next-move markers. Extracted out of
 * the SFC's `markers` computed so the branching logic (four
 * mode × active/variation combinations, the letters-mode →
 * circles fallback at a suggestion intersection, and the
 * PV-hover-preview suppression gate) is unit-testable without
 * mounting the component — the SFC's computed becomes a one-line
 * call into this function.
 *
 * License: Public Domain (The Unlicense)
 */

import type { BoardState, GameNode } from '../../types';

/**
 * A marker can carry a ring, a letter, or both — the four
 * (mode × active/variation) combinations differ on which fields
 * are populated. See `BoardVariationsOverlay.vue`'s header comment
 * for the full mode matrix.
 */
export interface VariationMarker {
  readonly x: number;
  readonly y: number;
  readonly key: string;
  readonly ring: { readonly stroke: string; readonly opacity: number } | null;
  readonly label: { readonly text: string; readonly color: string; readonly opacity: number } | null;
}

export interface DeriveVariationMarkersOptions {
  readonly variationsMode: 'off' | 'circles' | 'letters';
  readonly showActiveNextMove: boolean;
  // Intersection set of currently-rendered move-suggestion discs;
  // see BoardVariationsOverlay.vue's `suggestionPoints`.
  readonly suggestionPoints: ReadonlySet<string>;
  // True while a PV (principal-variation) hover preview is active
  // (`BoardWidget`'s `pvHoverActive`). The dashed visited-move /
  // next-move rings describe the *real* game tree's visited state,
  // which competes with the hypothetical PV overlay the user is
  // reading during a hover preview — the same reasoning that already
  // suppresses `BoardWidget`'s move-number labels during a PV hover
  // (see `BoardWidget.vue`'s `moveNumbersByCoord`). Checked first so
  // the marker walk is skipped entirely while suppressed.
  readonly suppressed: boolean;
  readonly ringStroke: string;
  readonly activeRingStroke: string;
  readonly labelColor: string;
}

export function deriveVariationMarkers(
  state: BoardState,
  opts: DeriveVariationMarkersOptions,
): VariationMarker[] {
  if (opts.suppressed) return [];

  const node: GameNode | undefined = state.nodes[state.currentNodeId];
  if (!node || node.children.length === 0) return [];

  const out: VariationMarker[] = [];
  let variationIdx = 0;

  for (let i = 0; i < node.children.length; i++) {
    const child = state.nodes[node.children[i]];
    // Defensive: a child reference without a node, or a child whose
    // move is null (root only) / a pass, has no board position.
    if (!child || !child.move || child.move.type !== 'place') continue;

    const isActive = i === node.activeChildIndex;
    const x = child.move.x;
    const y = child.move.y;

    if (isActive) {
      if (!opts.showActiveNextMove) continue;
      // magic-literal: 0.7 opacity — visible against the wood
      // texture without competing with stones.
      out.push({
        x, y,
        key: `active-${x}-${y}`,
        ring: {
          stroke:  opts.activeRingStroke,
          opacity: 0.7,
        },
        label: null,
      });
    } else {
      if (opts.variationsMode === 'off') continue;
      const letter = String.fromCharCode(0x41 /* 'A' */ + variationIdx);
      if (opts.variationsMode === 'circles') {
        out.push({
          x, y,
          key: `variation-${x}-${y}`,
          ring: {
            stroke:  opts.ringStroke,
            opacity: 0.7,
          },
          label: null,
        });
      } else {
        const overlapsSuggestion = opts.suggestionPoints.has(`${x},${y}`);
        if (overlapsSuggestion) {
          out.push({
            x, y,
            key: `variation-${x}-${y}`,
            ring: {
              stroke:  opts.ringStroke,
              opacity: 0.7,
            },
            label: null,
          });
        } else {
          out.push({
            x, y,
            key: `variation-${x}-${y}`,
            ring: null,
            label: {
              text:    letter,
              color:   opts.labelColor,
              opacity: 0.9,
            },
          });
        }
      }
      variationIdx++;
    }
  }

  return out;
}
