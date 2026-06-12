/**
 * src/engine/katago/query-routing.ts
 *
 * The SELECTOR-routing seam: the ONE place an analysis query's `model`
 * leg is decided before the query may reach the wire.
 *
 * ── Why this exists (making the bug unrepresentable) ──────────────────
 * `KataGoAnalysisQuery.model` is optional in the wire type — correctly,
 * since on a non-SELECTOR proxy the field has no meaning and clients
 * should omit it (see the SELECTOR docs in `types.ts`). But an optional
 * field plus per-path query assembly made the routing leg a per-builder
 * memory test: three independent builders (analysis-service, the
 * engine-play harness, mint-time komi calibration) each had to remember
 * the `...(selectedModel !== null ? { model: selectedModel } : {})`
 * spread by hand. The calibration builder forgot it and compiled fine;
 * the SELECTOR rejected its queries on the wire ("missing 'model' field
 * for SELECTOR routing", 2026-06-12) — the second occurrence of the
 * class (the e2e harness hit it first:
 * docs/worklog/2026-06-11-e2e-harness-selector-model-field.md).
 *
 * The fix is structural rather than remembered: `KataGoClient.subscribe`
 * and `fresh-eval.awaitFinalPacket` accept analysis traffic only as
 * `RoutedAnalysisQuery` — a brand minted SOLELY by
 * `finalizeAnalysisRouting`, whose signature forces an explicit routing
 * decision (`selectedModel: string | null`, where `null` is the
 * deliberate LEAF-mode omission, not a forgotten leg). A builder that
 * skips the seam no longer fails on the wire; it fails to COMPILE.
 *
 * Enforcement is two-layered:
 *   - TYPE: the brand at the send seam; compile-time pin (positive +
 *     negative assertions) in `subscribe-narrowing.type-test.ts`.
 *   - LINT: `as RoutedAnalysisQuery` outside this file is a
 *     no-restricted-syntax error (`eslint.config.js`), so the brand
 *     cannot be quietly forged around the factory. This file carries
 *     the one justified inline disable at the mint.
 *
 * License: Public Domain (The Unlicense)
 */

import type { Brand } from '../../types/ids';
import type { KataGoAnalysisQuery } from './types';

/**
 * An analysis query whose SELECTOR-routing decision has been made.
 * Mint via `finalizeAnalysisRouting` — nowhere else (lint-fenced).
 */
export type RoutedAnalysisQuery = Brand<KataGoAnalysisQuery, 'RoutedAnalysisQuery'>;

/**
 * An assembled analysis query that has NOT yet decided its routing.
 * `model?: never` forbids builders from smuggling the leg in
 * themselves — the factory owns it entirely, so the routing slot has
 * exactly one writer.
 */
export type UnroutedAnalysisQuery = Omit<KataGoAnalysisQuery, 'model'> & {
  readonly model?: never;
};

/**
 * Decide the SELECTOR routing for an assembled analysis query.
 *
 * @param query Assembled by the caller's builder; carries every leg
 *   EXCEPT `model` (the `model?: never` shape rejects smuggling).
 * @param selectedModel The routing decision: `store.engine.selectedModel`
 *   for app paths (the Toolbar dropdown's label; `null` in LEAF mode
 *   where the dropdown doesn't render), or the harness caller's explicit
 *   label. `null` means "deliberately omit the wire field" (non-SELECTOR
 *   proxy) — an explicit claim, not a default.
 */
export function finalizeAnalysisRouting(
  query: UnroutedAnalysisQuery,
  selectedModel: string | null,
): RoutedAnalysisQuery {
  const routed: KataGoAnalysisQuery =
    selectedModel !== null ? { ...query, model: selectedModel } : { ...query };
  // Brand mint, justified: this factory IS the routing seam — the one
  // place the decision is made. The lint fence forbids this cast
  // everywhere else.
  // eslint-disable-next-line no-restricted-syntax -- sole RoutedAnalysisQuery mint (see header)
  return routed as RoutedAnalysisQuery;
}
