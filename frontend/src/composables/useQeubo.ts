/**
 * src/composables/useQeubo.ts
 * qEUBO calibration state machine — owns the reactive view of the
 * server-side experiment plus the toolbar's audition state.
 *
 * ─── Architectural placement ─────────────────────────────────────────────────
 * Module-scoped singleton (same shape as `useAuth`): exactly one
 * experiment exists per user, just as exactly one JWT exists in
 * localStorage. The state is private; the public functions returned by
 * `useQeubo()` are the only writers.
 *
 * State held here is *operational* — what the server-side optimizer is
 * doing right now. The user's *configuration* (parameter_meta,
 * qeuboPinnedBookmarks, qeuboToolbarView) lives in the GlobalStore and
 * survives session boundaries; this module reads from / writes to those
 * store fields where the dispatch's behaviour requires it.
 *
 * ─── Public surface ──────────────────────────────────────────────────────────
 * Lifecycle:
 *   - `bootstrap()`            — probes /qeubo/experiment/status on
 *                                login. Sets `calibrationEnabled` to
 *                                true (200 / 404), false (503), or
 *                                leaves null on unexpected errors.
 *   - `startNewExperiment(p)`  — POST /qeubo/experiment with the given
 *                                ordered parameter list; reads ranges
 *                                from analysis_env.parameter_meta.
 *                                Auto-fetches the first pair so the
 *                                toolbar shows A/B immediately.
 *   - `abortExperiment()`      — DELETE /qeubo/experiment; clears
 *                                state; resets toolbarView to
 *                                'applied'.
 *   - `submitPreference(0|1)`  — POST /qeubo/experiment/preference
 *                                with the current pair's UUID.
 *                                Observation only — does NOT write to
 *                                analysis_env.parameters. Auto-fetches
 *                                the next pair after submission.
 *   - `applyEffective()`       — Promotes the currently-effective
 *                                audition (A or B's decoded values
 *                                overlaid on `parameters`) into
 *                                `analysis_env.parameters`. Resets
 *                                toolbarView to 'applied'. No-op when
 *                                already 'applied'.
 *   - `refreshPair()`          — Re-fetch the current pair (the
 *                                backend's re-issue semantics return
 *                                the same pair if one is pending).
 *   - `refreshBest()`          — GET /qeubo/experiment/best.
 *                                Surfaces 'init-not-ready' as an info
 *                                message rather than an error.
 *   - `pinCurrent(name)`       — Snapshot effectiveParameterValues
 *                                into profile.qeuboPinnedBookmarks.
 *   - `applyBookmark(id)`      — Restore a bookmark's parameters
 *                                into analysis_env.parameters.
 *
 * Reactive state:
 *   - `calibrationEnabled`     — null | true | false. Drives toolbar
 *                                visibility (false → hide).
 *   - `experimentExists`       — true iff `_status` is non-null.
 *   - `phase`                  — 'init' | 'optimization' | 'idle'.
 *   - `initProgress`           — { done, total } during init.
 *   - `optimizationProgress`   — { iteration, total } during opt.
 *   - `currentPair`            — last fetched A/B pair.
 *   - `currentBestEstimate`    — last fetched posterior best.
 *   - `toolbarView`            — writable ref, proxies
 *                                session.ui.qeuboToolbarView.
 *   - `effectiveParameterValues`
 *                              — base parameters overlaid with the
 *                                pair's values according to
 *                                toolbarView. The toolbar's audition
 *                                surfaces this; PR 3 will wire it
 *                                into analysis-service so the engine
 *                                sees the audition during evaluation.
 *   - `isBusy`                 — true while a request is in flight.
 *
 * ─── Bundled-apply UX (separable, per qEUBO note 2026-04-28) ────────────────
 * Dispatch v1.1 specified a bundled flow ("I prefer A" submits AND
 * applies). The user resolved this in favour of separable verdict +
 * apply: the toggle auditions, the verdict submits the qEUBO
 * observation only, and an explicit apply action promotes the
 * audition into analysis_env.parameters. `submitPreference` here
 * therefore does NOT touch the parameters store; `applyEffective`
 * does. See `docs/notes/qEUBO.md` open-items section.
 *
 * License: Public Domain (The Unlicense)
 */

import { computed, ref, type ComputedRef, type Ref, type WritableComputedRef } from 'vue';
import { generateUUID } from '../engine/util';
import { qeuboService } from '../services/qeubo-service';
import { pushSystemMessage, store } from '../store';
import {
  QeuboError,
  type BookmarkId,
  type QeuboBest,
  type QeuboBookmark,
  type QeuboPair,
  type QeuboPhase,
  type QeuboStatus,
} from '../types';

// ─── Module-scoped state ─────────────────────────────────────────────────────

const _statusRef = ref<QeuboStatus | null>(null);
const _pairRef = ref<QeuboPair | null>(null);
const _bestRef = ref<QeuboBest | null>(null);
// null = unknown (pre-bootstrap or transient error); true = backend
// has QEUBO_ENABLED=true; false = backend returned 503.
const _calibrationEnabledRef = ref<boolean | null>(null);
const _isBusyRef = ref<boolean>(false);

// ─── Toolbar-view bridge ─────────────────────────────────────────────────────
// Proxy `session.ui.qeuboToolbarView` through a WritableComputedRef so
// the field's optionality is collapsed to the runtime guarantee (the
// migration ensures it's always set) without sprinkling `??` at every
// read site. The toolbar binds to this via v-model.

const _toolbarView: WritableComputedRef<'applied' | 'A' | 'B'> = computed({
  get: () => (store.session.ui.qeuboToolbarView ?? 'applied') as 'applied' | 'A' | 'B',
  set: (v: 'applied' | 'A' | 'B') => {
    store.session.ui.qeuboToolbarView = v;
  },
});

// ─── Computeds ───────────────────────────────────────────────────────────────

const _experimentExists = computed<boolean>(() => _statusRef.value !== null);

const _phase = computed<QeuboPhase | 'idle'>(() => _statusRef.value?.phase ?? 'idle');

const _initProgress = computed<{ done: number; total: number } | null>(() => {
  const s = _statusRef.value;
  if (!s || s.phase !== 'init') return null;
  return { done: s.initIndex, total: s.numInitQueries };
});

const _optimizationProgress = computed<{ iteration: number; total: number } | null>(() => {
  const s = _statusRef.value;
  if (!s || s.phase !== 'optimization') return null;
  return { iteration: s.iteration, total: s.numAlgoQueries };
});

/**
 * The values the engine should see during evaluation. When toolbarView
 * is 'applied', this is just the persistent `analysis_env.parameters`.
 * When 'A' or 'B', the corresponding pair's decoded values overlay
 * the persistent base — keys not present in the qEUBO pair (i.e.
 * parameters not under qEUBO control) keep their persistent values.
 *
 * If toolbarView is 'A' / 'B' but no pair is loaded, the audition
 * silently falls back to the persistent values; toolbar UI should
 * prevent the user from entering this state, but the computed is
 * defensive so consumers never see undefined-shaped data.
 */
const _effectiveParameterValues = computed<Record<string, number>>(() => {
  const base = store.profile.settings.engine.katago.analysis_env.parameters;
  const view = _toolbarView.value;
  const pair = _pairRef.value;
  if (view === 'A' && pair) return { ...base, ...pair.valuesA };
  if (view === 'B' && pair) return { ...base, ...pair.valuesB };
  return { ...base };
});

/**
 * The persistent parameter set the engine actually reads — the
 * toolbar's "Applied" reference, regardless of which view (A / B /
 * Applied) is currently being previewed. Distinct from
 * `effectiveParameterValues`, which reflects the preview state and
 * therefore changes as the seg-toggle is clicked.
 */
const _appliedParameterValues = computed<Record<string, number>>(() =>
  ({ ...store.profile.settings.engine.katago.analysis_env.parameters })
);

// ─── Lifecycle ───────────────────────────────────────────────────────────────

/**
 * Probe `/qeubo/experiment/status` and populate the composable's
 * reactive view. Idempotent: callers may invoke this on every login,
 * identity change, or manual refresh; the same code path runs each
 * time. There is no run-once gate — the cost is one HTTP probe per
 * call and the composable's state is overwritten with the latest
 * server-side truth.
 *
 * Three terminal outcomes set `calibrationEnabled`:
 *   200 → true,  with `_statusRef` populated and pending pair fetched.
 *   404 → true,  with `_statusRef` null  (no experiment for this user).
 *   503 → false, all state cleared      (calibration disabled).
 *
 * Other errors (network failure, unexpected QeuboErrorKind) leave
 * `calibrationEnabled` at its prior value and surface a system
 * message; the caller may retry.
 */
async function bootstrap(): Promise<void> {
  // Clear lazily-fetched state so a re-bootstrap after an
  // experiment change doesn't surface stale best / pair from
  // the previous experiment. The pair is re-fetched below if
  // the new experiment has one pending; the best is re-fetched
  // on demand via refreshBest.
  _pairRef.value = null;
  _bestRef.value = null;
  try {
    const status = await qeuboService.getStatus();
    _statusRef.value = status;
    _calibrationEnabledRef.value = true;
    if (status.hasPending) {
      try {
        const pair = await qeuboService.getPair();
        _pairRef.value = pair;
      } catch (err) {
        // A failure here doesn't invalidate the bootstrap result;
        // the user can retry via refreshPair from the toolbar.
        console.warn('[useQeubo] bootstrap: pending pair re-fetch failed:', err);
      }
    }
    return;
  } catch (err) {
    if (err instanceof QeuboError) {
      if (err.kind === 'disabled') {
        _calibrationEnabledRef.value = false;
        _statusRef.value = null;
        return;
      }
      if (err.kind === 'no-experiment') {
        _calibrationEnabledRef.value = true;
        _statusRef.value = null;
        return;
      }
      // 'init-not-ready' shouldn't surface from /status; if it
      // does, surface loudly per ADR-0002.
      pushSystemMessage('error', `qEUBO bootstrap: unexpected error kind ${err.kind}`);
      return;
    }
    // Network or other generic error. Calibration state stays at
    // its prior value (null on first call); the user can retry.
    pushSystemMessage('warning', 'qEUBO bootstrap failed; calibration status unknown.');
    console.warn('[useQeubo] bootstrap failed:', err);
  }
}

async function startNewExperiment(controlledParams: string[]): Promise<void> {
  if (controlledParams.length === 0) {
    throw new Error('qEUBO: cannot start an experiment with zero controlled parameters.');
  }
  const pm = store.profile.settings.engine.katago.analysis_env.parameter_meta ?? {};
  const ranges: Record<string, [number, number]> = {};
  for (const name of controlledParams) {
    const meta = pm[name];
    if (!meta?.range) {
      throw new Error(
        `qEUBO: parameter "${name}" has no [min, max] range in parameter_meta. ` +
        `Set the range in the Analysis Environment editor before enabling qeubo_controlled.`,
      );
    }
    ranges[name] = meta.range;
  }
  _isBusyRef.value = true;
  try {
    const exp = await qeuboService.createExperiment({
      controlledParameters: controlledParams,
      parameterRanges: ranges,
    });
    // Synthesize the initial QeuboStatus from the create response.
    // The fields the create response doesn't carry default to
    // their fresh-experiment values.
    _statusRef.value = {
      experimentId: exp.experimentId,
      phase: exp.phase,
      initIndex: exp.initIndex,
      numInitQueries: exp.numInitQueries,
      iteration: exp.iteration,
      numAlgoQueries: exp.numAlgoQueries,
      totalResponses: 0,
      hasPending: false,
      pendingQueryUuid: undefined,
    };
    _pairRef.value = null;
    _bestRef.value = null;
    _calibrationEnabledRef.value = true;
    // Auto-fetch the first pair so the toolbar surfaces A/B
    // immediately on creation.
    const pair = await qeuboService.getPair();
    _pairRef.value = pair;
    _statusRef.value = {
      ..._statusRef.value,
      hasPending: true,
      pendingQueryUuid: pair.queryUuid,
    };
  } finally {
    _isBusyRef.value = false;
  }
}

async function abortExperiment(): Promise<void> {
  _isBusyRef.value = true;
  try {
    try {
      await qeuboService.deleteExperiment();
    } catch (err) {
      // 404 → already gone, treat as success.
      if (!(err instanceof QeuboError && err.kind === 'no-experiment')) {
        throw err;
      }
    }
    _statusRef.value = null;
    _pairRef.value = null;
    _bestRef.value = null;
    _toolbarView.value = 'applied';
  } finally {
    _isBusyRef.value = false;
  }
}

async function submitPreference(preferred: 0 | 1): Promise<void> {
  const pair = _pairRef.value;
  if (!pair) {
    throw new Error('qEUBO: cannot submit preference without a pending pair.');
  }
  _isBusyRef.value = true;
  try {
    const result = await qeuboService.submitPreference(pair.queryUuid, preferred);
    if (_statusRef.value) {
      _statusRef.value = {
        ..._statusRef.value,
        phase: result.phase,
        iteration: result.iteration,
        initIndex: result.initIndex,
        totalResponses: result.totalResponses,
        hasPending: false,
        pendingQueryUuid: undefined,
      };
    }
    _pairRef.value = null;
    // Auto-fetch the next pair so the toolbar continues without a
    // user-visible blank state. Inlined (rather than calling
    // refreshPair) to keep `_isBusyRef` consistently true through
    // the full submit-then-refetch flow — a finally/setter gap
    // would briefly flash `isBusy` to false between calls and
    // toolbar spinners would flicker.
    const nextPair = await qeuboService.getPair();
    _pairRef.value = nextPair;
    if (_statusRef.value) {
      _statusRef.value = {
        ..._statusRef.value,
        hasPending: true,
        pendingQueryUuid: nextPair.queryUuid,
      };
    }
  } finally {
    _isBusyRef.value = false;
  }
}

async function refreshPair(): Promise<void> {
  _isBusyRef.value = true;
  try {
    const pair = await qeuboService.getPair();
    _pairRef.value = pair;
    if (_statusRef.value) {
      _statusRef.value = {
        ..._statusRef.value,
        hasPending: true,
        pendingQueryUuid: pair.queryUuid,
      };
    }
  } finally {
    _isBusyRef.value = false;
  }
}

async function refreshBest(): Promise<void> {
  try {
    const best = await qeuboService.getBest();
    _bestRef.value = best;
  } catch (err) {
    if (err instanceof QeuboError && err.kind === 'init-not-ready') {
      _bestRef.value = null;
      pushSystemMessage('info', err.message);
      return;
    }
    throw err;
  }
}

function applyEffective(): void {
  if (_toolbarView.value === 'applied') return;
  const eff = _effectiveParameterValues.value;
  store.profile.settings.engine.katago.analysis_env.parameters = { ...eff };
  _toolbarView.value = 'applied';
}

/**
 * Synchronous local-state reset. Clears every piece of state owned
 * by this composable without making any network calls. Used when
 * the SPA's auth identity is lost (logout, identity change) — the
 * subsequent bootstrap (called when a new identity authenticates)
 * re-populates from /status.
 *
 * Does NOT touch the GlobalStore (qeuboPinnedBookmarks,
 * qeuboToolbarView, parameter_meta) — those are user-data and the
 * SyncService's identity-aware workspace handling owns their
 * lifecycle.
 */
function reset(): void {
  _statusRef.value = null;
  _pairRef.value = null;
  _bestRef.value = null;
  _calibrationEnabledRef.value = null;
  _isBusyRef.value = false;
}

// ─── Bookmarks ───────────────────────────────────────────────────────────────

function pinCurrent(name: string): void {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('qEUBO: bookmark name must be non-empty.');
  }
  const eff = _effectiveParameterValues.value;
  const bookmark: QeuboBookmark = {
    id: generateUUID() as BookmarkId,
    name: trimmed,
    createdAt: Date.now(),
    parameters: { ...eff },
  };
  if (!store.profile.qeuboPinnedBookmarks) {
    store.profile.qeuboPinnedBookmarks = [];
  }
  store.profile.qeuboPinnedBookmarks.push(bookmark);
}

function applyBookmark(id: BookmarkId): void {
  const list = store.profile.qeuboPinnedBookmarks ?? [];
  const bookmark = list.find((b) => b.id === id);
  if (!bookmark) {
    pushSystemMessage('error', `qEUBO: bookmark ${id} not found.`);
    return;
  }
  store.profile.settings.engine.katago.analysis_env.parameters = { ...bookmark.parameters };
  _toolbarView.value = 'applied';
}

function renameBookmark(id: BookmarkId, newName: string): void {
  const trimmed = newName.trim();
  if (!trimmed) {
    throw new Error('qEUBO: bookmark name must be non-empty.');
  }
  const list = store.profile.qeuboPinnedBookmarks ?? [];
  const bookmark = list.find((b) => b.id === id);
  if (!bookmark) {
    pushSystemMessage('error', `qEUBO: bookmark ${id} not found.`);
    return;
  }
  bookmark.name = trimmed;
}

function deleteBookmark(id: BookmarkId): void {
  const list = store.profile.qeuboPinnedBookmarks;
  if (!list) return;
  const idx = list.findIndex((b) => b.id === id);
  if (idx === -1) {
    pushSystemMessage('error', `qEUBO: bookmark ${id} not found.`);
    return;
  }
  list.splice(idx, 1);
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface UseQeuboReturn {
  calibrationEnabled: ComputedRef<boolean | null>;
  experimentExists: ComputedRef<boolean>;
  phase: ComputedRef<QeuboPhase | 'idle'>;
  initProgress: ComputedRef<{ done: number; total: number } | null>;
  optimizationProgress: ComputedRef<{ iteration: number; total: number } | null>;
  currentPair: ComputedRef<QeuboPair | null>;
  currentBestEstimate: ComputedRef<QeuboBest | null>;
  toolbarView: Ref<'applied' | 'A' | 'B'>;
  effectiveParameterValues: ComputedRef<Record<string, number>>;
  appliedParameterValues: ComputedRef<Record<string, number>>;
  isBusy: ComputedRef<boolean>;
  bootstrap: () => Promise<void>;
  reset: () => void;
  startNewExperiment: (controlledParams: string[]) => Promise<void>;
  abortExperiment: () => Promise<void>;
  submitPreference: (preferred: 0 | 1) => Promise<void>;
  refreshPair: () => Promise<void>;
  refreshBest: () => Promise<void>;
  applyEffective: () => void;
  pinCurrent: (name: string) => void;
  applyBookmark: (id: BookmarkId) => void;
  renameBookmark: (id: BookmarkId, newName: string) => void;
  deleteBookmark: (id: BookmarkId) => void;
}

export function useQeubo(): UseQeuboReturn {
  return {
    calibrationEnabled: computed(() => _calibrationEnabledRef.value),
    experimentExists: _experimentExists,
    phase: _phase,
    initProgress: _initProgress,
    optimizationProgress: _optimizationProgress,
    currentPair: computed(() => _pairRef.value),
    currentBestEstimate: computed(() => _bestRef.value),
    toolbarView: _toolbarView,
    effectiveParameterValues: _effectiveParameterValues,
    appliedParameterValues: _appliedParameterValues,
    isBusy: computed(() => _isBusyRef.value),
    bootstrap,
    reset,
    startNewExperiment,
    abortExperiment,
    submitPreference,
    refreshPair,
    refreshBest,
    applyEffective,
    pinCurrent,
    applyBookmark,
    renameBookmark,
    deleteBookmark,
  };
}
