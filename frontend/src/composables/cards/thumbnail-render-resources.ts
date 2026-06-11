/**
 * src/composables/cards/thumbnail-render-resources.ts
 *
 * The single owner of every SHARED render resource behind the MiniBoard
 * thumbnail surfaces, plus the explicit invalidation surface over them.
 * Two resource classes live here, deliberately under one roof:
 *
 *   - the data layer — the replayed-position `BoardSnapshot` cache (one
 *     entry per NodeId; the expensive replay every thumbnail projects
 *     from) and its warmed-path guard;
 *   - the paint layer — the wood texture (decoded once per session) and
 *     the stone-sprite store (one offscreen canvas per colour ×
 *     device-pixel radius) the canvas renderer blits from.
 *
 * Why one owner module: the texture-flash investigation (2026-06-09;
 * `docs/notes/investigation-mini-board-texture-flash-2026-06-09.md`)
 * found resources commented "shared across every instance" living in
 * `MiniBoardCanvas.vue`'s `<script setup>` — which compiles into
 * `setup()`, i.e. per-instance — so every remount-per-hover consumer
 * re-paid the texture decode and first-painted textureless. A real `.ts`
 * module is module-scoped *by construction*: no `<script setup>`
 * footgun is expressible here, and every consumer lifecycle
 * (persistently-mounted analysis preview, remount-per-hover docked pane
 * and floating thumbnail) reads the same state. The syntactic guard for
 * the comment-claims-sharing class is `local/module-intent-in-script-setup`
 * (eslint); this module is the structural complement — the resources an
 * SFC could mis-scope simply do not live in SFCs anymore.
 *
 * Invalidation surface (the cache's correctness contract):
 *
 *   - `invalidateNodeSnapshots(nodeIds)` — node-content invalidation.
 *     CALLER-LESS AT HEAD, deliberately: the snapshot cache rests on
 *     node-content immutability under a stable NodeId (replay(node) is
 *     time-invariant). The one production path that can mutate an
 *     existing node's position content is `applySetup` (`src/logic.ts`),
 *     which has zero callers today (hydration-residue audit 2026-06-10,
 *     `docs/notes/audit/audit-hydration-rebind-residue-2026-06-10.md`
 *     §3.2). If a setup-edit mode ever wires it, the commit site must
 *     call this hook for the edited node and its descendants (or the
 *     coarse `purgeBoardThumbnails(boardId)`). The obligation is also
 *     named at `applySetup` itself.
 *   - `purgeBoardThumbnails(boardId)` — board lifecycle (audit pair O4,
 *     called from `closeBoard` before the splice).
 *   - `purgeAllThumbnails()` — identity flip (audit pair O9, registered
 *     in `IDENTITY_SCOPED_CACHES`; also resets the warmed-path guard).
 *
 * The fill/projection API over the snapshot cache (replay, SVG-string
 * projection, path warming) lives in the sibling composable
 * `useThumbnailCache.ts`; this module owns the state, the sibling owns
 * the derivations.
 *
 * License: Public Domain (The Unlicense)
 */

import { ref, type Ref } from 'vue';
import type { BoardSnapshot } from '../../engine/board-geometry';
import type { BoardId, NodeId, SpriteKey, StoneColor } from '../../types';
import { store } from '../../store';

// ── Data layer: the BoardSnapshot cache ─────────────────────────────────────
//
// Reactivity note (load-bearing): this is a `ref(Map)`, so Vue tracks the
// collection mutators — a `getSnapshotSync().get()` read inside a computed /
// render re-evaluates when a later `.set()` warms that key. The reactive
// preview consumers depend on exactly this: ChartPreviewBox, SidebarWidget's
// docked hover-preview pane, and FloatingThumbnail's derived snapshot all
// read the cache synchronously and rely on the (fire-and-forget) warm
// triggering the fill. Refactoring this to a plain `Map` or
// `markRaw(new Map())` would leave those panes race-free but *never
// populated*. Keep it a reactive collection.
const snapshotCache: Ref<Map<NodeId, BoardSnapshot>> = ref(new Map<NodeId, BoardSnapshot>());

// Warmed-path guard: the last node-id path `warmPath` (useThumbnailCache)
// warmed, so re-warming an identical path short-circuits. Owned here because
// purgeAllThumbnails must reset it (a stale fingerprint would short-circuit
// the next identity's first warm).
let lastWarmedPath: NodeId[] = [];

/** Synchronous cache read; null on a miss (the caller decides whether to warm). */
export function getCachedSnapshot(nodeId: NodeId): BoardSnapshot | null {
  return snapshotCache.value.get(nodeId) ?? null;
}

/** Cache a replayed snapshot under its node id (the single write path). */
export function cacheSnapshot(nodeId: NodeId, snap: BoardSnapshot): void {
  snapshotCache.value.set(nodeId, snap);
}

/** True when `nodeIds` is exactly the path the last warm covered. */
export function isPathWarm(nodeIds: readonly NodeId[]): boolean {
  return (
    nodeIds.length === lastWarmedPath.length &&
    nodeIds.every((id, i) => id === lastWarmedPath[i])
  );
}

/** Record `nodeIds` as the warmed path (see `isPathWarm`). */
export function markPathWarm(nodeIds: readonly NodeId[]): void {
  lastWarmedPath = [...nodeIds];
}

/**
 * Node-content invalidation: drop the cached snapshots for the given
 * nodes. THE `applySetup` HOOK — caller-less at HEAD by design; see the
 * file header for the obligation it exists to receive (a future
 * setup-edit mode mutating an existing node's position content must
 * invalidate the edited node and its descendants here).
 *
 * Also resets the warmed-path guard — the same O9 rationale verbatim:
 * "a stale fingerprint would short-circuit the next warm". Without
 * this, deleting a node whose id sits on the last-warmed path would
 * leave `lastWarmedPath` claiming that path warm while its cache
 * entries were just dropped, so the next identical `warmPath` would
 * short-circuit cold (the warm-guard invalidation asymmetry PR #413's
 * out-of-frame gate found — finding 2: the guard was reset only by
 * `purgeAllThumbnails`). The reset is unconditional rather than
 * path-membership-checked: clearing the guard is cheap, and a
 * conservative reset can never strand a warm. `purgeBoardThumbnails`
 * funnels its deletes through here, so it inherits the reset.
 */
export function invalidateNodeSnapshots(nodeIds: Iterable<NodeId>): void {
  for (const nodeId of nodeIds) {
    snapshotCache.value.delete(nodeId);
  }
  lastWarmedPath = [];
}

/**
 * Drop every cached snapshot for the given board's nodes. Called from
 * `closeBoard` when the board exits the workspace, so the shared cache
 * doesn't accumulate dead entries across the session.
 *
 * Walks the closing board's `nodes` keys (still readable here because
 * closeBoard runs this before splicing the board out of `store.boards`).
 * NodeIds that aren't in the cache are silently skipped — `Map.delete`
 * on a missing key is a no-op.
 *
 * Resource-ownership audit pair O4. See the file header for the
 * identity-flip companion (purgeAllThumbnails / O9). The warmed-path
 * guard reset (the asymmetry PR #413's gate found) is inherited from
 * `invalidateNodeSnapshots`, which this funnels its deletes through.
 */
export function purgeBoardThumbnails(boardId: BoardId): void {
  const board = store.boards.find(b => b.id === boardId);
  if (!board) return;
  // Object.keys widens Record<NodeId,…> keys to string[] (the TS "Category C"
  // boundary, IDENTIFIERS.md NodeId row); re-brand the keys.
  invalidateNodeSnapshots(Object.keys(board.nodes) as NodeId[]);
}

/**
 * Drop every cached snapshot. Called from `resetWorkspace` on identity
 * flip so the prior identity's renders don't accumulate in the singleton
 * across the session boundary. Also clears the warmed-path guard so the
 * next identity's first warmPath call actually warms (rather than
 * short-circuiting on a stale fingerprint match).
 *
 * Resource-ownership audit pair O9. NodeIds are UUID-style and don't
 * collide across users — this is memory hygiene, not a privacy concern
 * (cf. clearCardThumbnailCache / O10 where the raw-CardId collision
 * motivates the cleanup).
 */
export function purgeAllThumbnails(): void {
  snapshotCache.value.clear();
  lastWarmedPath = [];
}

// ── Paint layer: wood texture ───────────────────────────────────────────────
//
// Loaded once, genuinely shared across every MiniBoardCanvas instance.
// Instances that draw before the texture decodes repaint when it does
// (the waiter set). The session-static texture has no invalidation
// obligation — it is an asset, not derived state.

let woodImg: HTMLImageElement | null = null;
let woodReady = false;
const woodWaiters = new Set<() => void>();

/** Kick off the one-time wood-texture load; later calls are no-ops. */
export function ensureWood(): void {
  if (woodImg) return;
  const img = new Image();
  img.onload = () => {
    woodReady = true;
    woodWaiters.forEach((w) => w());
  };
  img.src = '/textures/wood.jpg';
  woodImg = img;
}

/** The decoded wood texture, or null while it is still loading. */
export function getWoodIfReady(): HTMLImageElement | null {
  return woodReady && woodImg ? woodImg : null;
}

/**
 * Register a repaint callback fired when the wood texture finishes
 * decoding. Pair every add with a `removeWoodWaiter` at the consumer's
 * teardown (MiniBoardCanvas does this in `onUnmounted`) — the set lives
 * beyond Vue's reactivity graph and nothing else frees the entry.
 */
export function addWoodWaiter(waiter: () => void): void {
  woodWaiters.add(waiter);
}

/** Release a previously-registered wood waiter (see `addWoodWaiter`). */
export function removeWoodWaiter(waiter: () => void): void {
  woodWaiters.delete(waiter);
}

// ── Paint layer: stone sprites ──────────────────────────────────────────────
//
// The radial-gradient stone is rendered once per (colour, device-pixel
// radius) into an offscreen canvas and blitted per stone — far cheaper than
// createRadialGradient per stone per redraw, and crisp because the sprite is
// rendered at the device-pixel radius. Shared across instances (bounded: few
// distinct radii on screen at once). Sprites are pure functions of their key
// legs, so the store needs no invalidation surface.

const spriteCache = new Map<SpriteKey, HTMLCanvasElement>();

/**
 * Sole factory for `SpriteKey` (the keyed-cache rule, frontend/CLAUDE.md
 * "Type-driven design"): the key's legs are the full dependency set of the
 * sprite it buckets — `color` [domain-bound] and the device-pixel radius
 * `rpx` [agnostic]. Everything else the draw reads is a literal constant.
 */
function spriteKey(color: StoneColor, rpx: number): SpriteKey {
  // SpriteKey brand mint: sole factory, sibling to the declaration's
  // dependency-set contract (src/types/game.ts).
  return `${color}-${rpx}` as SpriteKey;
}

/** The shared sprite for a stone colour at a device-pixel radius. */
export function stoneSprite(color: StoneColor, rpx: number): HTMLCanvasElement {
  const key = spriteKey(color, rpx);
  const cached = spriteCache.get(key);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = c.height = rpx * 2;
  const g = c.getContext('2d')!;
  // Offset highlight ≈ the SVG radial gradient (cx 35%, cy 30%, r 50%).
  const grad = g.createRadialGradient(rpx * 0.7, rpx * 0.6, rpx * 0.1, rpx, rpx, rpx * 1.05);
  if (color === 'B') { grad.addColorStop(0, '#666'); grad.addColorStop(1, '#111'); }
  else { grad.addColorStop(0, '#fff'); grad.addColorStop(1, '#d0d0d0'); }
  g.fillStyle = grad;
  g.beginPath(); g.arc(rpx, rpx, rpx, 0, Math.PI * 2); g.fill();
  g.lineWidth = Math.max(1, rpx * 0.05);
  g.strokeStyle = color === 'B' ? '#000' : '#aaa';
  g.stroke();
  spriteCache.set(key, c);
  return c;
}
