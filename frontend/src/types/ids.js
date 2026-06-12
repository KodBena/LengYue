/**
 * src/types/ids.ts
 *
 * Domain-agnostic identity brands: the `Brand<>` phantom-newtype
 * utility, the `PerBoard<T>` store-partitioning alias, and the
 * identity / config-key / content-hash brands that survive a port to
 * any knowledge domain. Game-coupled brands (`NodeId`, `StoneColor`,
 * `ColorMoveIndex`, `PlyIndex`) live in `src/types/game.ts` so a
 * domain fork replaces exactly one module wholesale. Carved from the
 * single-file `src/types.ts` (2026-06-10, history-lessons audit
 * §3.15); `src/types.ts` remains the barrel re-export, and bodies
 * here are verbatim from the pre-split file.
 *
 * License: Public Domain (The Unlicense)
 */
export {};
