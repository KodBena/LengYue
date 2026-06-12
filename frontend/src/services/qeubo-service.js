/**
 * src/services/qeubo-service.ts
 * Anti-Corruption Layer for the qEUBO calibration REST endpoints.
 * License: Public Domain (The Unlicense)
 *
 * The six endpoints under `/qeubo/experiment/*` (plus the bare
 * `/qeubo/experiment` POST/DELETE pair) defined in dispatch
 * `frontend-to-backend-qeubo-integration.md` §2.4. Wire shapes come
 * from the generated `components['schemas']['*']` types; this module
 * narrows them into the camel-case domain types declared in
 * `../types`. The `phase` field's string-typed wire is narrowed to
 * `'init' | 'optimization'` here, failing loudly per ADR-0002 if the
 * backend reports anything outside that set.
 *
 * Status-code handling is per dispatch §2.4 plus the backend's status
 * dispatch (`docs/dispatch/backend-to-frontend-qeubo-status.md`):
 *
 *   503 — `QEUBO_ENABLED=False` on this backend. Surfaces from any
 *         `/qeubo/*` route. Bootstrap probes `/status` and the
 *         composable hides the toolbar cluster on this signal.
 *   404 — No experiment exists for this user. From `/status`,
 *         `/pair`, `/preference`, `/best`, `/history`, or `DELETE`.
 *   409 — Model not yet fitted (`phase === 'init'`). Specific to
 *         `/best`; means "collect more init responses before asking
 *         for a posterior best."
 *
 * These three codes map to `QeuboError` instances with discriminated
 * `kind` so consumers can pattern-match cleanly. Other errors
 * propagate as the generic `Error` thrown by `api-client.ts`.
 */
import { api, ApiError } from './api-client';
import { QeuboError, } from '../types';
// ─── Helpers ─────────────────────────────────────────────────────────────────
/**
 * Pull the HTTP status out of an `ApiError` thrown by `api-client.ts`.
 * Returns null when the error wasn't an `ApiError` (network failure,
 * code bug, etc.) — those propagate as generic errors per ADR-0002's
 * no-silent-fallback rule.
 */
function extractStatus(err) {
    return err instanceof ApiError ? err.status : null;
}
/**
 * Narrow the wire's `string` phase field into the domain's
 * discriminated union. Throws on anything else; the runtime can't
 * meaningfully proceed if the contract is violated.
 */
function narrowPhase(s) {
    if (s === 'init' || s === 'optimization')
        return s;
    throw new Error(`PBO: backend reported phase=${JSON.stringify(s)}, expected 'init' or 'optimization'.`);
}
function mapExperiment(wire) {
    return {
        experimentId: wire.experiment_id,
        config: wire.config,
        controlledParameters: wire.controlled_parameters,
        phase: narrowPhase(wire.phase),
        initIndex: wire.init_index,
        numInitQueries: wire.num_init_queries,
        iteration: wire.iteration,
        numAlgoQueries: wire.num_algo_queries,
    };
}
function mapStatus(wire) {
    return {
        experimentId: wire.experiment_id,
        phase: narrowPhase(wire.phase),
        initIndex: wire.init_index,
        numInitQueries: wire.num_init_queries,
        iteration: wire.iteration,
        numAlgoQueries: wire.num_algo_queries,
        totalResponses: wire.total_responses,
        hasPending: wire.has_pending,
        pendingQueryUuid: wire.pending_query_uuid ?? undefined,
    };
}
function mapPair(wire) {
    return {
        queryUuid: wire.query_uuid,
        pointA: wire.point_a,
        pointB: wire.point_b,
        valuesA: wire.values_a,
        valuesB: wire.values_b,
        phase: narrowPhase(wire.phase),
        iteration: wire.iteration,
        reissued: wire.reissued,
    };
}
function mapBest(wire) {
    return {
        point: wire.point,
        values: wire.values,
        phase: narrowPhase(wire.phase),
        iteration: wire.iteration,
    };
}
function mapPreferenceResult(wire) {
    return {
        phase: narrowPhase(wire.phase),
        iteration: wire.iteration,
        initIndex: wire.init_index,
        totalResponses: wire.total_responses,
        completed: wire.completed,
    };
}
function mapHistory(wire) {
    return {
        history: wire.history,
        phase: narrowPhase(wire.phase),
        iteration: wire.iteration,
        totalResponses: wire.total_responses,
    };
}
// ─── Service class ───────────────────────────────────────────────────────────
// Per-route lists of statuses that are part of the qEUBO contract
// (not deviations). Threaded through `api.request` via
// `options.silentStatuses` so they don't surface as system-log
// errors; they still throw with the `API Error <status>` message
// shape so `rethrowAs` can map them to typed `QeuboError`s.
const POST_EXPERIMENT_SILENT = [503];
const DELETE_EXPERIMENT_SILENT = [404, 503];
const GET_STATUS_SILENT = [404, 503];
const GET_PAIR_SILENT = [404, 503];
const POST_PREFERENCE_SILENT = [404, 503];
const GET_BEST_SILENT = [404, 409, 503];
const GET_HISTORY_SILENT = [404, 503];
export class QeuboService {
    async createExperiment(input) {
        const body = {
            controlled_parameters: input.controlledParameters,
            parameter_ranges: input.parameterRanges,
            config_overrides: input.configOverrides ?? null,
        };
        try {
            const wire = await api.request('POST', '/qeubo/experiment', body, {
                silentStatuses: POST_EXPERIMENT_SILENT,
            });
            return mapExperiment(wire);
        }
        catch (err) {
            throw rethrowAs(err, { 503: 'disabled' });
        }
    }
    async deleteExperiment() {
        try {
            await api.request('DELETE', '/qeubo/experiment', undefined, {
                silentStatuses: DELETE_EXPERIMENT_SILENT,
            });
        }
        catch (err) {
            throw rethrowAs(err, { 503: 'disabled', 404: 'no-experiment' });
        }
    }
    async getStatus() {
        try {
            const wire = await api.request('GET', '/qeubo/experiment/status', undefined, {
                silentStatuses: GET_STATUS_SILENT,
            });
            return mapStatus(wire);
        }
        catch (err) {
            throw rethrowAs(err, { 503: 'disabled', 404: 'no-experiment' });
        }
    }
    async getPair() {
        try {
            const wire = await api.request('GET', '/qeubo/experiment/pair', undefined, {
                silentStatuses: GET_PAIR_SILENT,
            });
            return mapPair(wire);
        }
        catch (err) {
            throw rethrowAs(err, { 503: 'disabled', 404: 'no-experiment' });
        }
    }
    async submitPreference(queryUuid, preferred) {
        const body = { query_uuid: queryUuid, preferred };
        try {
            const wire = await api.request('POST', '/qeubo/experiment/preference', body, {
                silentStatuses: POST_PREFERENCE_SILENT,
            });
            return mapPreferenceResult(wire);
        }
        catch (err) {
            throw rethrowAs(err, { 503: 'disabled', 404: 'no-experiment' });
        }
    }
    async getBest() {
        try {
            const wire = await api.request('GET', '/qeubo/experiment/best', undefined, {
                silentStatuses: GET_BEST_SILENT,
            });
            return mapBest(wire);
        }
        catch (err) {
            throw rethrowAs(err, { 503: 'disabled', 404: 'no-experiment', 409: 'init-not-ready' });
        }
    }
    async getHistory() {
        try {
            const wire = await api.request('GET', '/qeubo/experiment/history', undefined, {
                silentStatuses: GET_HISTORY_SILENT,
            });
            return mapHistory(wire);
        }
        catch (err) {
            throw rethrowAs(err, { 503: 'disabled', 404: 'no-experiment' });
        }
    }
}
// ─── Error mapping ──────────────────────────────────────────────────────────
const ERROR_MESSAGES = {
    disabled: 'PBO calibration is not enabled on this backend (QEUBO_ENABLED=False).',
    'no-experiment': 'No PBO experiment exists for the current user.',
    'init-not-ready': 'PBO model not yet fitted; collect more init responses before asking for a posterior best.',
};
/**
 * Inspect a thrown error against an HTTP-status → `QeuboErrorKind` map.
 * If the error came from `api-client.ts` and its status is in the map,
 * return a fresh `QeuboError`; otherwise return the original error
 * unchanged. Callers do `throw rethrowAs(err, { ... })` so the function
 * is always used in an exception path.
 */
function rethrowAs(err, statusToKind) {
    const status = extractStatus(err);
    if (status !== null && status in statusToKind) {
        const kind = statusToKind[status];
        return new QeuboError(kind, status, ERROR_MESSAGES[kind]);
    }
    return err;
}
export const qeuboService = new QeuboService();
