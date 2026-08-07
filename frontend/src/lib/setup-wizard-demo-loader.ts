/**
 * src/lib/setup-wizard-demo-loader.ts
 *
 * Builds the first-run setup wizard's demo board (ledger slug
 * swz-setup-wizard, step "d" — demo board) from the static asset
 * `src/assets/setup-wizard-demo.json` (Go Seigen (B) vs Fujisawa
 * Hosai (W), 1971-05-26, move 117; provenance header inside the
 * asset itself). ZERO network, ZERO engine: the asset already
 * carries a captured KataGo analysis packet (moveInfos + ownership
 * + policy + rootInfo at 4015 visits), so this module only replays
 * the recorded move list through the pure rules engine
 * (`logic.ts::applyGoMove` / `applyPass`) to build a real
 * `BoardState`, then hands the captured analysis straight to the
 * SAME ledger the live engine path writes
 * (`state/analysis-ledger.ts::ledger.recordRaw`) — one fact, one
 * home (ADR-0012): the demo board is never a second analysis
 * pipeline, only a second SOURCE for the one pipeline's input.
 *
 * ADR-0002 (fail loudly): a malformed asset — a coordinate outside
 * the board, a length mismatch on `ownership`/`policy`, a missing
 * required field — throws synchronously with a message naming the
 * defect. `useSetupWizard.ts` surfaces the thrown error via
 * `pushSystemMessage` and skips straight past the demo-board step
 * rather than rendering a blank board, per the commission's
 * explicit "loud error, not a blank board" instruction.
 *
 * License: Public Domain (The Unlicense)
 */

import demoAsset from '../assets/setup-wizard-demo.json';
import { createInitialBoard } from '../store/board-factory';
import { applyGoMove, applyPass } from '../logic';
import { fromGtp } from '../engine/util';
import type { BoardState, NodeId } from '../types';
import type { RawAnalysis, KataCoord } from '../engine/katago/types';

export interface SetupWizardDemoProvenance {
  readonly gameRawId: number;
  readonly black: string;
  readonly white: string;
  readonly date: string;
  readonly result: string;
  readonly position: number;
  readonly rules: string;
  readonly komi: number;
  readonly model: string;
  readonly maxVisits: number;
}

export interface SetupWizardDemo {
  /** A real `BoardState`, replayed to the asset's recorded position. */
  readonly board: BoardState;
  /** The captured analysis packet, unmodified from the asset. */
  readonly rawAnalysis: RawAnalysis;
  /** The board's node id at the analysed position — the ledger key. */
  readonly nodeId: NodeId;
  readonly provenance: SetupWizardDemoProvenance;
}

const BOARD_SIZE = 19;

/** Narrow runtime shape the asset must satisfy — checked field by
 *  field so a malformed asset names the specific missing/wrong-typed
 *  field rather than failing on a generic destructure crash. */
function assertShape(raw: unknown): asserts raw is typeof demoAsset {
  const fail = (msg: string): never => {
    throw new Error(`[setup-wizard-demo-loader] Malformed demo asset: ${msg}`);
  };
  if (!raw || typeof raw !== 'object') fail('root is not an object');
  // Narrowing cast: `raw` is checked non-null/object above; every field
  // read below is itself checked before use, so this only widens the
  // index-signature for the field-by-field probes that follow.
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.moves) || r.moves.length === 0) fail('"moves" is missing or empty');
  if (!r.analysis || typeof r.analysis !== 'object') fail('"analysis" is missing');
  // Narrowing cast: `r.analysis` is checked non-null/object on the line
  // above; same field-by-field-checked-before-use posture as `r` above.
  const a = r.analysis as Record<string, unknown>;
  if (!Array.isArray(a.moveInfos)) fail('"analysis.moveInfos" is missing');
  if (!Array.isArray(a.ownership) || a.ownership.length !== BOARD_SIZE * BOARD_SIZE) {
    fail(`"analysis.ownership" must have ${BOARD_SIZE * BOARD_SIZE} entries (got ${Array.isArray(a.ownership) ? a.ownership.length : typeof a.ownership})`);
  }
  if (!Array.isArray(a.policy)) fail('"analysis.policy" is missing');
  if (!a.rootInfo || typeof a.rootInfo !== 'object') fail('"analysis.rootInfo" is missing');
  if (!r.provenance || typeof r.provenance !== 'object') fail('"provenance" is missing');
}

/** Replays the asset's recorded move list through the pure rules
 *  engine, building a real BoardState. Throws (via `fromGtp`) on any
 *  coordinate the rules engine or the GTP parser rejects. */
function buildDemoBoard(moves: readonly (readonly [string, KataCoord])[], komi: number): { board: BoardState; nodeId: NodeId } {
  let board = createInitialBoard();
  const rootNode = board.nodes[board.rootNodeId];
  board = {
    ...board,
    nodes: {
      ...board.nodes,
      [board.rootNodeId]: {
        ...rootNode,
        properties: { ...rootNode.properties, KM: [String(komi)], RU: ['Japanese'] },
      },
    },
  };

  for (const [, coord] of moves) {
    const xy = fromGtp(coord, BOARD_SIZE);
    const next = xy === null ? applyPass(board) : applyGoMove(board, xy.x, xy.y);
    if (next === null) {
      throw new Error(`[setup-wizard-demo-loader] Recorded move "${coord}" was rejected by the rules engine (illegal for the position reached so far).`);
    }
    board = next;
  }

  return { board, nodeId: board.currentNodeId };
}

/**
 * Loads and validates the demo asset, replays it to a real
 * `BoardState`, and returns everything `useSetupWizardDemoBoard.ts`
 * needs to seed the ledger. Pure and synchronous — no network, no
 * engine, no Vue reactivity; safe to call from a composable's setup
 * or from a test.
 *
 * `raw` defaults to the real bundled asset; tests pass a
 * hand-built/corrupted object to exercise `assertShape`'s failure
 * paths without needing to fixture a second on-disk asset or mock
 * the JSON import.
 */
export function loadSetupWizardDemo(raw: unknown = demoAsset): SetupWizardDemo {
  assertShape(raw);

  const { board, nodeId } = buildDemoBoard(
    // Justified cast: `assertShape` above only checks `moves` is a
    // non-empty array (JSON gives us `string[][]`, not the tupled
    // `[string, KataCoord][]` the loop below assumes); each entry is
    // walked and validated per-coordinate by `fromGtp` inside
    // `buildDemoBoard`, so a malformed pair still fails loudly there.
    raw.moves as unknown as readonly (readonly [string, KataCoord])[],
    raw.provenance.komi,
  );

  return {
    board,
    // Justified cast: the asset is a captured, validated KataGo analysis
    // packet (moveInfos/ownership/policy/rootInfo checked above); its
    // shape is a structural superset of `RawAnalysis` (extra raw* fields
    // on rootInfo/moveInfos that `RawAnalysis`'s declared members don't
    // name but the ledger and every consumer read only the named ones).
    rawAnalysis: raw.analysis as unknown as RawAnalysis,
    nodeId,
    provenance: raw.provenance,
  };
}
