/**
 * src/types/qeubo.ts
 *
 * qEUBO calibration domain types: the camel-case projections of the
 * qEUBO wire shapes (experiment / status / pair / best / history),
 * the discriminated `QeuboError` class (a runtime export), and the
 * persisted `QeuboBookmark` parameter snapshot. Carved from the
 * single-file `src/types.ts` (2026-06-10, history-lessons audit
 * §3.15); bodies are verbatim from the pre-split file.
 *
 * License: Public Domain (The Unlicense)
 */

import type { BookmarkId } from './ids';
import type { KnobId } from './knobs';

// ── qEUBO calibration domain types ────────────────────────────────────────────
//
// Camel-case projections of the wire shapes documented in
// `docs/dispatch/frontend-to-backend-qeubo-integration.md` §2.4. The
// ACL at `services/qeubo-service.ts` translates between these and the
// generated `components['schemas']['*']` wire types from
// `types/backend.ts`. The phase string is narrowed from `string` (wire)
// to `'init' | 'optimization'` (domain); the ACL fails loudly per
// ADR-0002 if the wire reports anything outside that set.
//
// Owned at runtime by the `useQeubo` composable in
// `composables/useQeubo.ts`; declared here for accessibility by future
// consumers (toolbar, bookmarks UI, parameter-meta editor).

export type QeuboPhase = 'init' | 'optimization';

export interface QeuboExperiment {
  experimentId: string;
  config: Record<string, unknown>;
  controlledParameters: string[];
  phase: QeuboPhase;
  initIndex: number;
  numInitQueries: number;
  iteration: number;
  numAlgoQueries: number;
}

export interface QeuboStatus {
  experimentId: string;
  phase: QeuboPhase;
  initIndex: number;
  numInitQueries: number;
  iteration: number;
  numAlgoQueries: number;
  totalResponses: number;
  hasPending: boolean;
  pendingQueryUuid?: string;
}

export interface QeuboPair {
  queryUuid: string;
  pointA: number[];
  pointB: number[];
  valuesA: Record<string, number>;
  valuesB: Record<string, number>;
  phase: QeuboPhase;
  iteration: number;
  reissued: boolean;
}

export interface QeuboBest {
  point: number[];
  values: Record<string, number>;
  phase: QeuboPhase;
  iteration: number;
}

export interface QeuboPreferenceResult {
  phase: QeuboPhase;
  iteration: number;
  initIndex: number;
  totalResponses: number;
  completed: boolean;
}

export interface QeuboHistory {
  history: unknown[];
  phase: QeuboPhase;
  iteration: number;
  totalResponses: number;
}

export interface QeuboCreateInput {
  controlledParameters: string[];
  parameterRanges: Record<string, [number, number]>;
  configOverrides?: Record<string, unknown>;
}

// Discriminated error class. Three kinds get classified from HTTP
// status; everything else propagates as the generic `Error` thrown by
// `api-client.ts`. Consumers do `if (err instanceof QeuboError && err.kind === 'disabled') ...`.
export type QeuboErrorKind =
  | 'disabled'         // 503: QEUBO_ENABLED=False on this backend
  | 'no-experiment'    // 404: no experiment exists for this user
  | 'init-not-ready';  // 409 from /best: model not yet fitted

export class QeuboError extends Error {
  readonly kind: QeuboErrorKind;
  readonly status: number;
  constructor(kind: QeuboErrorKind, status: number, message: string) {
    super(message);
    this.name = 'QeuboError';
    this.kind = kind;
    this.status = status;
  }
}

// User-pinned snapshot of analysis_env.parameters values.
// Survives qEUBO experiment lifecycle (creating, replacing, or
// deleting an experiment does not affect the bookmark list). The
// id is generated frontend-side at pin time; createdAt is unix
// ms; parameters is a value-snapshot, not a reference.
//
// `parameters` is keyed by the substrate-native `KnobId`
// (`qeubo.<param-name>`) and holds each knob's value *vector*, not a
// bare scalar — aligning the bookmark with the knob-registry's own
// representation so an apply is a direct `writeKnobValue` pass-through.
// qEUBO parameters are scalar knobs today, so the arrays are length-1
// in practice; the `number[]` shape is what lets a future vector knob
// be bookmarked without another schema reshape. The flat
// `Record<string, number>` (bare param name → scalar) it replaced is
// migrated forward by schema migration 56 → 57.
export interface QeuboBookmark {
  id: BookmarkId;
  name: string;
  createdAt: number;
  parameters: Record<KnobId, number[]>;
}
