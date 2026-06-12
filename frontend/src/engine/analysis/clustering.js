/**
 * Groups an array of KataMoveInfo by their clusterId.
 * Moves without a clusterId are ignored.
 */
export function groupMovesByCluster(moveInfos) {
    const map = new Map();
    for (const move of moveInfos) {
        if (move.clusterId !== undefined) {
            const cid = String(move.clusterId);
            if (!map.has(cid))
                map.set(cid, []);
            map.get(cid).push(move);
        }
    }
    return map;
}
