/**
 * src/composables/useSgfDownload.ts
 * Self-contained SGF file-saving composable.
 *
 * ## Contract
 * Exposes a single action: `downloadActiveBoard()`. Calling it
 * serialises the active board's tree via `serializeBoard`,
 * derives a filename from the root node's `PB` / `PW` / `DT`
 * properties, and triggers a browser download via a transient
 * anchor element.
 *
 * Mirror of `useSgfLoader`: transient DOM element pattern, no
 * template ref required.
 *
 * License: Public Domain (The Unlicense)
 */

import { serializeBoard } from '../engine/sgf-writer';
import { store, pushSystemMessage } from '../store';
import type { BoardState } from '../types';

// ── Public contract ───────────────────────────────────────────────────────────

export interface SgfDownloadActions {
  /**
   * Serialise the active board and trigger a browser download.
   * No-op (with a system-log warning) if no active board exists.
   */
  downloadActiveBoard: () => void;
}

// ── Composable ────────────────────────────────────────────────────────────────

export function useSgfDownload(): SgfDownloadActions {
  function downloadActiveBoard(): void {
    const board = store.boards[store.activeBoardIndex];
    if (!board) {
      pushSystemMessage('warning', 'No active board to save.');
      return;
    }

    let content: string;
    try {
      content = serializeBoard(board);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      pushSystemMessage('error', `SGF serialisation failed: ${detail}`);
      console.error('[useSgfDownload] serializeBoard threw:', err);
      return;
    }

    const filename = deriveFilename(board);
    triggerDownload(filename, content);
    pushSystemMessage('info', `Saved ${filename}.`);
  }

  return { downloadActiveBoard };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Composes a default filename from the root node's PB / PW / DT
 * properties. Examples:
 *   PB="Lee Sedol", PW="AlphaGo", DT="2016-03-09" → "Lee_Sedol-vs-AlphaGo-2016-03-09.sgf"
 *   No metadata                                   → "board.sgf"
 *
 * Only `[a-zA-Z0-9_-]` survive the sanitiser; anything else
 * collapses to `_`. Cross-platform-safe filename.
 */
function deriveFilename(board: BoardState): string {
  const root = board.nodes[board.rootNodeId];
  const props = root?.properties ?? {};

  const sanitise = (s: string): string =>
    s.trim().replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');

  const pb = props['PB']?.[0];
  const pw = props['PW']?.[0];
  const dt = props['DT']?.[0];

  const players = [pb, pw].map(s => s ? sanitise(s) : '').filter(Boolean);
  let stem = players.length ? players.join('-vs-') : 'board';
  if (dt) {
    const cleanedDt = sanitise(dt);
    if (cleanedDt) stem += `-${cleanedDt}`;
  }
  return `${stem}.sgf`;
}

/**
 * Browser-side file delivery via Blob + transient `<a download>`.
 * `application/octet-stream` is the conservative MIME — the
 * filename's `.sgf` extension carries the format info; the
 * browser respects the `download` attribute regardless of MIME.
 */
function triggerDownload(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after the click fires synchronously; the download is
  // already in flight by the time we return.
  URL.revokeObjectURL(url);
}
