/**
 * src/services/query-id.ts
 *
 * Sole construction / re-brand site for the `QueryId` brand — the SPA-minted,
 * ephemeral correlation id for an in-flight engine query (the wire `id` the
 * proxy echoes back). Generation sites build a semantic id string (e.g.
 * `range-<board>-<ts>`) and lift it through `asQueryId`; the wire-response
 * boundary (where a `KataGoAnalysisQuery.id: string` must be read back as the
 * id the SPA minted) re-brands through the same factory.
 *
 * Identity at runtime (the brand erases); the function exists so every
 * `QueryId` value flows through one named, greppable construction site rather
 * than scattered `as QueryId` casts (the IDENTIFIERS.md construction
 * discipline, mirroring `asNodeId` / `asBoardId`).
 *
 * License: Public Domain (The Unlicense)
 */
import type { QueryId } from '../types';

export const asQueryId = (id: string): QueryId => id as QueryId;
