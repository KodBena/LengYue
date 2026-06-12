/**
 * src/engine/sgf-writer.ts
 * SGF serialization.
 * License: Public Domain (The Unlicense)
 */
import { getPath } from './navigator';
function escapeSgf(value) {
    return value.replace(/\\/g, '\\\\').replace(/]/g, '\\]');
}
function serializeProperties(node) {
    let out = ';';
    for (const [key, values] of Object.entries(node.properties)) {
        if (!values || values.length === 0) {
            if (import.meta.env.DEV)
                console.warn(`[SgfWriter] node ${node.id} has empty value array for key "${key}" — skipping`);
            continue;
        }
        out += key + values.map(v => `[${escapeSgf(v)}]`).join('');
    }
    return out;
}
/**
 * ─── Branded-type signature discipline (Commit 2-tail) ──────────────────────
 * Both parameters tightened from `string` and `Record<string, GameNode>`
 * to their branded forms. The function only ever receives values that are
 * by construction NodeIds and a Record<NodeId, GameNode>: callers thread
 * `state.nodes` (Record<NodeId, GameNode>) and `state.rootNodeId` (NodeId)
 * from BoardState, and the recursion threads `node.children[i]` (NodeId
 * from GameNode.children: NodeId[]).
 *
 * After tightening, the recursive `serializeSubtree(node.children[0], nodes)`
 * and the `node.children.map(childId => ...)` both typecheck without any
 * cast or implicit-any annotation: `childId` infers as NodeId from the
 * children array's element type.
 * ──────────────────────────────────────────────────────────────────────────
 */
function serializeSubtree(nodeId, nodes) {
    const node = nodes[nodeId];
    if (!node) {
        console.error(`[SgfWriter] serializeSubtree: nodeId "${nodeId}" not found in nodes`);
        return '';
    }
    const props = serializeProperties(node);
    if (node.children.length === 0) {
        return props;
    }
    if (node.children.length === 1) {
        return props + serializeSubtree(node.children[0], nodes);
    }
    const branches = node.children
        .map(childId => '(' + serializeSubtree(childId, nodes) + ')')
        .join('');
    return props + branches;
}
export function serializeBoard(state) {
    const result = '(' + serializeSubtree(state.rootNodeId, state.nodes) + ')';
    return result;
}
/**
 * Set (or insert) the root-node `KM` (komi) property on an already-
 * serialized SGF string, returning a new SGF with the adjusted komi.
 *
 * Used by mint-time komi calibration: the mint draft already holds the
 * serialized `raw_content`, and re-deriving + re-serializing the board
 * would risk drifting from the exact SGF the draft captured. Rewriting
 * the one property in place is the minimal, drift-free change.
 *
 * The root node is the first `;`-prefixed property block, immediately
 * after the opening `(`. Two cases:
 *
 *   - **`KM` present** — replace its single value. The SGF this writer
 *     emits has at most one `KM[...]` on the root (komi is a single-
 *     valued property), so the first match on the root block is THE
 *     komi.
 *   - **`KM` absent** — insert `KM[<komi>]` at the head of the root
 *     block's properties (right after the leading `;`), so it sits
 *     alongside `SZ` / `GM` / `FF`.
 *
 * Pure and total. Throws (ADR-0002) if the input is not a well-formed
 * SGF collection (no leading `(;`) rather than silently returning a
 * mangled string — a malformed `raw_content` at mint time is a bug, not
 * a value to coerce. The numeric komi is formatted with `String(komi)`,
 * matching the `KM[6.5]` / `KM[7]` shapes KataGo and the SGF spec
 * accept; the calibration caller has already rounded to a half-integer.
 */
export function setSgfRootKomi(sgf, komi) {
    // The root block runs from the first `;` (just inside the opening
    // paren) up to the next structural delimiter that ends it: another
    // `;` (the next node), a `(` (a variation), or the closing `)`.
    const openMatch = sgf.match(/^\(\s*;/);
    if (!openMatch) {
        throw new Error(`setSgfRootKomi: input is not a well-formed SGF collection ` +
            `(expected a leading "(;"): ${JSON.stringify(sgf.slice(0, 32))}…`);
    }
    const rootStart = openMatch[0].length; // index just after the root's leading `;`
    // Find where the root block's properties end: the first `;`, `(`, or
    // `)` AT THE TOP LEVEL of the root block. Property values can contain
    // `;`/`(`/`)` inside `[...]`, so scan bracket-aware.
    let rootEnd = sgf.length;
    let inValue = false;
    for (let i = rootStart; i < sgf.length; i++) {
        const ch = sgf[i];
        if (inValue) {
            if (ch === '\\') {
                i++;
                continue;
            } // escaped char inside a value
            if (ch === ']')
                inValue = false;
            continue;
        }
        if (ch === '[') {
            inValue = true;
            continue;
        }
        if (ch === ';' || ch === '(' || ch === ')') {
            rootEnd = i;
            break;
        }
    }
    const rootBlock = sgf.slice(rootStart, rootEnd);
    const before = sgf.slice(0, rootStart);
    const after = sgf.slice(rootEnd);
    const komiStr = String(komi);
    // Replace an existing root `KM[...]` value (single-valued property)
    // or insert a fresh one at the head of the root block.
    const kmRe = /KM\[(?:\\.|[^\]\\])*\]/;
    const rewrittenRoot = kmRe.test(rootBlock)
        ? rootBlock.replace(kmRe, `KM[${escapeSgf(komiStr)}]`)
        : `KM[${escapeSgf(komiStr)}]` + rootBlock;
    return before + rewrittenRoot + after;
}
export function serializeActivePath(state) {
    // SHAPE NOTE (branded-path-types arc, 2026-06-10): despite the name,
    // this serializes ROOT→CURRENT — the moves up to the cursor — NOT the
    // active variation line root→leaf. The minting consumer
    // (`useMinting.prepareDraft`) depends on exactly that: a card is
    // minted from the position the user is looking at, excluding any
    // forward variation past it. The path now comes from the branded
    // producer `getPath` (`RootToCurrentPath`) instead of the previous
    // hand-rolled walk, so the shape is compile-visible; the old walk's
    // silent `break` on a missing node — which would have serialized a
    // TRUNCATED SGF, a silent-corruption path for a minted card — is
    // replaced by getPath's fail-loud throw on a corrupt tree
    // (ADR-0002). The misleading name predates the brands; renaming is a
    // maintainer call because the symbol is exposed on the
    // `window.Writer` console-debug surface (`main.ts`).
    const path = getPath(state.nodes, state.currentNodeId);
    let out = '(';
    for (const nodeId of path) {
        out += serializeProperties(state.nodes[nodeId]);
    }
    out += ')';
    return out;
}
