/**
 * src/types/engine.ts
 *
 * Engine-connection state vocabulary: `EngineState` (the
 * `GlobalStore.engine` subtree), the `EngineMetrics` / `EngineInfo`
 * value objects, the model-entry shape, and the status / mode
 * unions. KataGo/proxy-coupled (ADR-0003 Band 3): together with the
 * owner module `services/engine-connection.ts` this replaces
 * wholesale for a fork with a different (or no) analysis provider.
 * Carved from the single-file `src/types.ts` (2026-06-10,
 * history-lessons audit §3.15); bodies are verbatim from the
 * pre-split file.
 *
 * License: Public Domain (The Unlicense)
 */

import type { BoardId, PerBoard } from './ids';
import type { SystemMessage } from './app';
// Imported so `EngineInfo.capabilities` can reference the typed
// capability-advertisement mirror.
import type { CapabilityAdvertisement } from '../engine/katago/types';

export type EngineStatus = 'disconnected' | 'connecting' | 'connected';
export type AnalysisMode = 'none' | 'ponder' | 'analyze';

// EngineMetrics is a value object (immutable, swapped wholesale); the
// `metrics` *field* on EngineState below is mutable (the swap is the
// mutation). This is the idiomatic functional-state pattern.
export interface EngineMetrics {
  readonly packetsPerSecond: number;
  readonly lastResponseId: BoardId | null;
  readonly lastWatchdogTimestamp: number;
  readonly latencyMs: number;
  /**
   * Wall-clock ms at which the most recent watchdog `query_version`
   * was fired and has not yet received a response. `null` means
   * either no ping in flight (the last pong has arrived), or the
   * watchdog hasn't fired yet on this session. Used by the
   * Toolbar's optional ping-tandem watchdog-dot animation
   * (`session.ui.watchdogColorTransition`) — the animation runs
   * while this is non-null and resets on `null`.
   */
  readonly pingPendingSince: number | null;
}

// ── State Container (readonly removed) — EngineState ──────────────────────────

export interface EngineState {
  status: EngineStatus;
  // `metrics` field is reassigned wholesale by analysis-service
  // (`store.engine.metrics = { ...metrics, packetsPerSecond: x }`); the
  // EngineMetrics value object inside is itself immutable. Mutable
  // container, immutable value.
  metrics: EngineMetrics;
  // Per-board analysis mode. `Partial<Record<>>` reflects that keys
  // are added by analyze* calls, set to `'none'` by stopBoardAnalysis,
  // deleted by `closeBoard` when the owning board exits, and replaced
  // wholesale by analysisService.disconnect / onDisconnect. Same
  // ADR-0001 / ADR-0002 reasoning as `reviews` above. Consumers
  // (App.vue, useUserIORegistry) compare against `'ponder'`, which
  // is correct against both `'none'` and `undefined`.
  activeMode: PerBoard<AnalysisMode>;
  messages: SystemMessage[];
  // Engine identity captured from the upstream KataGo backend on
  // every fresh WebSocket open: `query_version` returns the engine
  // version string; `query_models` returns the loaded neural-net
  // model list. Consumed by the Toolbar for the "what am I talking
  // to" surface so a config change at the engine side is visible
  // without restarting the frontend. Both fields are populated
  // optimistically — `null` / empty until the probe round-trips on
  // connect / reconnect; `EngineInfo` is a value object the
  // analysis-service reassigns wholesale (same shape as `metrics`
  // above). Visible label uses `internalName` (KataGo's model
  // self-identifier — short, no path leakage); the full responses
  // are retained in `versionPayload` / `modelsPayload` so a hover
  // tooltip can surface the privacy-concerning `name` field
  // (typically a filesystem path) on demand for debugging.
  info: EngineInfo;
  // SELECTOR-mode model selection. Set when the proxy advertises
  // `selector` on its `query_version` capabilities AND the user has
  // chosen one of the labelled models from the Toolbar dropdown;
  // `null` means "no selection" (LEAF mode, or SELECTOR mode where
  // the user hasn't picked yet — the proxy will reject queries with
  // missing/unknown `model` field per ADR-0002).
  //
  // Consumed at the analysis-service ACL: when non-null, injected
  // into outgoing analysis queries as the `model` wire field
  // (proxy reads, dispatches via labelled WebSocket pool, strips
  // before forwarding to upstream LEAF). Above the ACL no module
  // learns that model selection is happening — the selection is a
  // proxy-routing concern, not a domain concern.
  //
  // Mutated through the named mutator `setSelectedModel` in
  // `store/index.ts`; persists through SyncService like any other
  // engine setting (see `closeBoard`'s comment on why the engine
  // surface is intentionally preserved across the `resetWorkspace`
  // identity-flip — the WebSocket URL is not user-keyed in the
  // current local-machine deployment).
  selectedModel: string | null;
}

export interface EngineModelEntry {
  // Identifier the SPA passes back via the `model` query field
  // when SELECTOR routing is in play. For SELECTOR-mode proxies
  // this is the `label` field on each `models[i]` entry (an
  // operator-chosen short name like `"strong"`); for LEAF-mode
  // proxies the array has a single entry whose `label` is derived
  // from `internalName` so the dropdown's data shape is uniform.
  readonly label: string;
  // Per-label availability, surfaced by SELECTOR's synthesised
  // `query_models` response (proxy v1.0.18+) so the model-selector
  // dropdown can grey out advertised-but-disconnected labels — a
  // SELECTOR may list every configured model regardless of upstream
  // state, and the SPA should not let the user pick one whose
  // upstream is currently unreachable. Pre-v1.0.18 proxies (and
  // LEAF-mode responses) don't carry the field; the parser defaults
  // it to `true` so older proxies and the LEAF-mode shape behave as
  // they did before this addition.
  readonly healthy: boolean;
}

export interface EngineInfo {
  // Engine version string, e.g. "1.13.0".
  readonly version: string | null;
  // Short model identifier — `models[0].internalName` from KataGo's
  // `query_models` response. Short and path-free, suitable for
  // streaming / screenshare contexts where the filesystem-path
  // `name` field would leak operator info. On a SELECTOR proxy this
  // is null (SELECTOR's synthesized `query_models` carries `label`
  // not `internalName`); the Toolbar's MODEL slot reads
  // `availableModels` instead in that mode.
  readonly internalName: string | null;
  // Full payloads of the two probe responses, retained verbatim so
  // a hover tooltip can show the entire engine response (including
  // the privacy-concerning `name` field) on demand. Null until the
  // corresponding probe round-trips. Plain `Record<string, unknown>`
  // because the per-version response shape is loose at the wire.
  readonly versionPayload: Record<string, unknown> | null;
  readonly modelsPayload: Record<string, unknown> | null;
  // Normalised model list — derived once at probe time from
  // `modelsPayload.models[i]`, picking up either `.label` (SELECTOR
  // mode) or `.internalName` (LEAF mode) per the dispatch's wire
  // contract. Empty when neither field is parseable. Single-source
  // for the Toolbar dropdown (rendered when `capabilities.selector`
  // is present in the advertisement) and for the SELECTOR's routing
  // key validation. Reactive-friendly readonly array; the analysis-
  // service reassigns the entire `info` value object wholesale.
  readonly availableModels: readonly EngineModelEntry[];
  // Capability advertisement from `query_version`'s response (the
  // optional `capabilities` field on `KataActionResponse`). Null when
  // the field is absent — either a pre-v1.0.14 proxy, or a v1.0.14+
  // proxy with `PROXY_ADVERTISE_CAPABILITIES=false` (the operator
  // hasn't opted into surfacing capabilities yet). Non-null when the
  // field is present, even when the dict is empty (proxy advertises
  // "no capabilities at all" — distinct from "absent advertisement"
  // semantically per the dispatch's Q1 sign-off; the SPA's
  // capability-injection helper distinguishes legacy auto-engage
  // from explicit empty advertisement when computing per-query
  // opt-ins).
  //
  // Read by the analysis service to gate per-query capability
  // injection (`delta_analysis`, `transposition`,
  // `adaptive_reevaluate`) and by the Toolbar to gate the SELECTOR
  // dropdown render (which requires `selector` in the advertised
  // dict).
  //
  // Typed as the capability mirror (`CapabilityAdvertisement` in
  // `engine/katago/types.ts`): per-capability metadata fields the
  // SPA reads (`adaptive_reevaluate.available_value_bindings`, …)
  // are declared there and validated once at probe time by
  // `version-probe.ts::parseVersionResponse` — a known capability
  // advertised with mismatched metadata is degraded (dropped from
  // this dict and surfaced loudly) before it lands here, so
  // consumers read the declared fields cast-free.
  readonly capabilities: CapabilityAdvertisement | null;
}
