/**
 * src/types/game.ts
 *
 * The game domain module: Go value objects (Point / Move /
 * GameMetadata / NodeDelta), the game-tree state containers
 * (GameNode / BoardState and the play-vs-engine session types), and
 * the game-coupled brands (`NodeId`, `StoneColor`, `ColorMoveIndex`,
 * `PlyIndex`). Deliberately one module per ADR-0003's fork sizing: a
 * domain fork replaces this module wholesale while `types/ids.ts`
 * (the agnostic identity brands) survives. Carved from the
 * single-file `src/types.ts` (2026-06-10, history-lessons audit
 * §3.15); bodies are verbatim from the pre-split file.
 *
 * License: Public Domain (The Unlicense)
 */
export {};
