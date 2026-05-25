/**
 * src/services/analysis-persistence-service.ts
 * HTTP boundary for the analysis-bundle persistence feature.
 *
 * One service, three public verbs: save (project ledger → upload),
 * restore (download → replay into ledger), discard (delete server
 * row + forget cached summary). Plus refreshSummaries / summaryFor
 * for UI surfaces that want to render "Saved 2 minutes ago, 142
 * analyses, 1.2 MB" without forcing a list call per render.
 *
 * The qEUBO-service precedent (qeubo-service.ts) is followed: the
 * service IS both the ACL boundary (snake_case wire ↔ camelCase
 * domain, branded BoardId, typed AnalysisBundleStorageError on
 * known envelopes) AND the orchestration layer (project / replay
 * via the pure functions in analysis-bundle.ts). A separate
 * route-level ACL on backend-service.ts would be near-empty
 * wrappers; collapse them here.
 *
 * Reactive state: a per-BoardId summaries Map. Populated by
 * refreshSummaries() at app boot, updated by save() and discard().
 * Consumers (the AnalysisControls UI) read via summaryFor(),
 * triggering Vue's Map reactivity so a save flips the displayed
 * subtitle without manual invalidation.
 *
 * Resource ownership: closeBoard's audit pair calls discard() to
 * release the per-board server row alongside ledger.purgeBoard;
 * resetWorkspace calls forgetAll() to clear cached summaries on
 * identity flip (the server-side rows belong to the prior
 * identity's user_id and are inaccessible to the new identity by
 * the tenancy boundary, so a server-side wipe is unnecessary —
 * the summaries cache is the only frontend-side resource to
 * release).
 *
 * License: Public Domain (The Unlicense)
 */

import { reactive } from 'vue';
import { api } from './api-client';
import {
  asBoardId,
  parseStorageError,
  projectLedgerToBundle,
  replayBundleIntoLedger,
  type AnalysisBundle,
  type AnalysisBundleStorageError,
  type AnalysisBundleSummary,
  type AnalysisRecord,
} from './analysis-bundle';
import type { BoardId, NodeId } from '../types';
import type { components } from '../types/backend';

// ── Wire-type aliases (the ACL boundary) ─────────────────────────────────────

type AnalysisBundleWire = components['schemas']['AnalysisBundle'];
type AnalysisBundleRecordWire = components['schemas']['AnalysisBundleRecord'];
type AnalysisBundleSummaryWire = components['schemas']['AnalysisBundleSummary'];

// ── In-contract HTTP statuses (silenced from the system log) ─────────────────
//
// 404 on GET is the "no bundle saved yet" case — routine, not an
// error. 413 on PUT carries a structured body the UI surfaces
// directly, so the system-log message would be duplicate. The
// silentStatuses option mutes the system-log push only; the api-
// client still throws and the typed-error rethrow flow below
// translates to AnalysisBundleStorageError.
const GET_SILENT = [404] as const;
const PUT_SILENT = [413] as const;

// ── Wire ↔ domain projections ────────────────────────────────────────────────

function toWireBundle(bundle: AnalysisBundle): AnalysisBundleWire {
  return {
    schema_version: bundle.schemaVersion,
    records: bundle.records.map(toWireRecord),
  };
}

function toWireRecord(r: AnalysisRecord): AnalysisBundleRecordWire {
  return {
    config_hash: r.configHash,
    node_id: r.nodeId,
    packet: r.packet as unknown as { [k: string]: unknown },
  };
}

function fromWireBundle(wire: AnalysisBundleWire): AnalysisBundle {
  return {
    schemaVersion: wire.schema_version,
    records: wire.records.map(fromWireRecord),
  };
}

function fromWireRecord(wire: AnalysisBundleRecordWire): AnalysisRecord {
  return {
    configHash: wire.config_hash,
    nodeId: wire.node_id as NodeId,
    // Trust the backend to return the packet shape unchanged — it's
    // opaque storage on its side, byte-for-byte modulo JSON
    // normalisation. The cast is the codebase's standard
    // KataAnalysisResponse typing point; widening here would force
    // every consumer through a runtime narrow that the existing
    // analysis-service paths don't do.
    packet: wire.packet as unknown as AnalysisRecord['packet'],
  };
}

function fromWireSummary(wire: AnalysisBundleSummaryWire): AnalysisBundleSummary {
  return {
    boardId: asBoardId(wire.board_id),
    recordCount: wire.record_count,
    storedScheme: wire.stored_scheme,
    storedByteSize: wire.stored_byte_size,
    updatedAt: wire.updated_at,
  };
}

// ── Typed-error rethrow ──────────────────────────────────────────────────────
//
// Wrap the api-client's generic Error in an AnalysisBundleStorageError
// when the body matches one of the three known envelopes; rethrow the
// original otherwise so unexpected failures retain their full
// diagnostic text (per ADR-0002).
function rethrowAsStorageError(err: unknown): never {
  const parsed = parseStorageError(err);
  if (parsed) throw parsed;
  throw err;
}

// ── Service ──────────────────────────────────────────────────────────────────

export class AnalysisPersistenceService {
  // Reactive cache of per-board server-side metadata. Populated by
  // refreshSummaries(); updated incrementally by save() (sets) and
  // discard() (deletes). Vue's Map reactivity makes summaryFor()
  // reads observe future mutations.
  private readonly summaries = reactive(new Map<BoardId, AnalysisBundleSummary>());

  // Reactive per-board dirty counter, monotonically incremented by
  // markDirty() on each authoritative ledger.record landing for a
  // board (final-packet path only — during-search previews don't
  // bump). The composable layer (`useAutoSaveAnalyses`) watches
  // dirtyVersionFor() for rising-edge save triggers; the counter
  // itself never resets, so a fresh composable mount can sync to
  // the current version without losing prior bumps.
  private readonly dirtyVersions = reactive(new Map<BoardId, number>());

  // Reactive per-board "auto-save is paused on persistent error"
  // signal. Set by the auto-save composable when a save fails with
  // an AnalysisBundleStorageError (quota / too-large — the same
  // input would fail again, so re-firing on every subsequent
  // markDirty would burn bandwidth into the same wall). Cleared by
  // (a) a successful save() call, (b) clearAutoSaveError() called
  // when the user toggles analysisAutoSave off→on via the registry
  // editor. AnalysisControls.vue renders this entry so the user
  // sees why auto-save stopped firing.
  private readonly autoSaveErrors = reactive(
    new Map<BoardId, AnalysisBundleStorageError>(),
  );

  /**
   * PUT the projection of the AnalysisLedger for `boardId` to the
   * server. Returns the server-side metadata; updates the local
   * summaries cache as a side effect so the UI's "saved at X"
   * subtitle flips immediately.
   *
   * Throws AnalysisBundleStorageError on per-bundle cap (413
   * bundle_too_large) or per-user quota (413 user_quota_exceeded);
   * other failures rethrow as the api-client's generic Error.
   */
  public async save(boardId: BoardId): Promise<AnalysisBundleSummary> {
    const bundle = projectLedgerToBundle(boardId);
    try {
      const wire = await api.request<AnalysisBundleSummaryWire>(
        'PUT',
        `/analysis-bundles/${encodeURIComponent(boardId)}`,
        toWireBundle(bundle),
        { silentStatuses: PUT_SILENT },
      );
      const summary = fromWireSummary(wire);
      this.summaries.set(summary.boardId, summary);
      // Successful save clears any "auto-save paused on error" entry
      // for this board — the user fixed whatever blocked auto-save
      // (freed quota by discarding another bundle, ran a smaller
      // analysis, etc.) and the next markDirty should resume.
      this.autoSaveErrors.delete(boardId);
      return summary;
    } catch (err) {
      rethrowAsStorageError(err);
    }
  }

  /**
   * GET the bundle stored for `boardId` (if any) and replay every
   * record into the AnalysisLedger via the existing record() API.
   * The ledger's mergeAnalysisPacket preserves higher-visit packets
   * already in flight, so replay-after-live-analysis is safe.
   *
   * Returns the number of records replayed; null when no bundle
   * exists for this board (404 — the routine "nothing to restore"
   * case). Throws AnalysisBundleStorageError on 500 unknown_scheme
   * (operator-side issue); other failures rethrow generic.
   */
  public async restore(boardId: BoardId): Promise<{ recordsReplayed: number } | null> {
    let wire: AnalysisBundleWire;
    try {
      wire = await api.request<AnalysisBundleWire>(
        'GET',
        `/analysis-bundles/${encodeURIComponent(boardId)}`,
        undefined,
        { silentStatuses: GET_SILENT },
      );
    } catch (err) {
      if (err instanceof Error && /^API Error 404:/.test(err.message)) {
        return null;
      }
      rethrowAsStorageError(err);
    }
    const bundle = fromWireBundle(wire);
    replayBundleIntoLedger(bundle);
    return { recordsReplayed: bundle.records.length };
  }

  /**
   * Idempotent server-side delete; clears the local summaries
   * entry so the UI flips back to "no bundle saved" immediately.
   *
   * Called from closeBoard's resource-ownership audit pair so a
   * board's server bundle releases at the same moment its ledger
   * entries do (and the in-memory summary entry, kept here).
   * Failures rethrow generic — no parseStorageError envelope
   * applies to DELETE.
   */
  public async discard(boardId: BoardId): Promise<void> {
    await api.request<void>(
      'DELETE',
      `/analysis-bundles/${encodeURIComponent(boardId)}`,
    );
    this.summaries.delete(boardId);
  }

  /**
   * Re-fetch every summary for the current user; rebuilds the
   * cache from scratch. Called at app bootstrap once authentication
   * has settled and the document blob has hydrated; identity-flip
   * paths call forgetAll() first and re-fire refreshSummaries()
   * after the new identity hydrates.
   */
  public async refreshSummaries(): Promise<void> {
    const wire = await api.request<AnalysisBundleSummaryWire[]>('GET', '/analysis-bundles');
    this.summaries.clear();
    for (const w of wire) {
      const summary = fromWireSummary(w);
      this.summaries.set(summary.boardId, summary);
    }
  }

  /**
   * Reactive read of the cached summary for a given board, or
   * undefined when no save exists. Reading inside a computed /
   * watch tracks via Vue's Map reactivity, so a subsequent save()
   * or discard() re-fires the consumer.
   */
  public summaryFor(boardId: BoardId): AnalysisBundleSummary | undefined {
    return this.summaries.get(boardId);
  }

  /**
   * Bump the per-board dirty counter. Called by `analysis-service`
   * after each authoritative (`!isDuringSearch`) ledger.record
   * landing — i.e. each final analyze packet that contributes to
   * the bundle a future save() would project. During-search
   * previews are deliberately excluded: their packets get merged
   * into the ledger entry that the next final supersedes, so
   * triggering auto-save off them would re-PUT half-finished data.
   *
   * Counter never resets; the auto-save composable tracks its
   * own "last-seen" version per board for rising-edge detection.
   */
  public markDirty(boardId: BoardId): void {
    const current = this.dirtyVersions.get(boardId) ?? 0;
    this.dirtyVersions.set(boardId, current + 1);
  }

  /**
   * Reactive read of the per-board dirty counter. The auto-save
   * composable subscribes via Vue's Map reactivity; absent entries
   * read as 0 so the rising-edge comparison against a tracked
   * "last-seen" version naturally fires on the first markDirty.
   */
  public dirtyVersionFor(boardId: BoardId): number {
    return this.dirtyVersions.get(boardId) ?? 0;
  }

  /**
   * Set by the auto-save composable when a save call fails with a
   * persistent `AnalysisBundleStorageError` (quota / too-large —
   * the next markDirty would fail against the same wall, so the
   * composable pauses itself for this board until either a manual
   * save() succeeds, the user toggles `analysisAutoSave` off→on,
   * or `clearAutoSaveError()` is called directly.
   */
  public setAutoSaveError(boardId: BoardId, err: AnalysisBundleStorageError): void {
    this.autoSaveErrors.set(boardId, err);
  }

  /**
   * Reactive read of the per-board auto-save pause state.
   * AnalysisControls.vue surfaces a non-null result as an inline
   * notice ("Auto-save paused: {reason}; resume by Save or by
   * toggling the leaf").
   */
  public autoSaveErrorFor(boardId: BoardId): AnalysisBundleStorageError | undefined {
    return this.autoSaveErrors.get(boardId);
  }

  /**
   * Clear the auto-save pause for `boardId`. Called by the
   * auto-save composable on the `analysisAutoSave` false→true
   * rising edge (the user actively re-enabling the feature is the
   * gesture that should resume firing). save()'s success path
   * already calls `autoSaveErrors.delete()` directly; this method
   * is the explicit re-arm seam.
   */
  public clearAutoSaveError(boardId: BoardId): void {
    this.autoSaveErrors.delete(boardId);
  }

  /**
   * Clear every auto-save pause entry. Used by the auto-save
   * composable on the gate false→true transition (re-arming all
   * boards at once) and by forgetAll() on identity flip.
   */
  public clearAllAutoSaveErrors(): void {
    this.autoSaveErrors.clear();
  }

  /**
   * Drop the cached summary for `boardId` without making an HTTP
   * call. Used by closeBoard when the user closes a board whose
   * server bundle should be deleted — the discard() above does
   * both halves; this method is for the rare case where only the
   * cache release is wanted (e.g., an operator-side admin path
   * that wipes data through other means).
   *
   * Currently no callers other than forgetAll(); kept narrow for
   * symmetry with the audit-ownership pattern (every resource has
   * an explicit release verb, even when also subsumed by a higher
   * one).
   */
  public forgetBoard(boardId: BoardId): void {
    this.summaries.delete(boardId);
  }

  /**
   * Drop every cached summary. Called from resetWorkspace on
   * identity flip — the server-side rows belong to the previous
   * identity's user_id and are inaccessible to the new identity
   * via the tenancy boundary, so no DELETE storm is needed; the
   * frontend-side cache is the only resource to release.
   * Resource-ownership audit follow-up to O8.
   */
  public forgetAll(): void {
    this.summaries.clear();
    this.dirtyVersions.clear();
    this.autoSaveErrors.clear();
  }
}

export const analysisPersistenceService = new AnalysisPersistenceService();
