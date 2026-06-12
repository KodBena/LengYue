export const EMPTY_ENRICHED = {
    stateSeries: [],
    deltaSeries: { black: [], white: [] },
};
// Pick the winner among a per-`mIdx` contributor map: the value at the highest
// path index (last-path-order-wins). Null when there are no contributors.
function winnerByMaxIndex(contrib) {
    let bestIdx = -1;
    let value = null;
    for (const [idx, v] of contrib) {
        if (idx > bestIdx) {
            bestIdx = idx;
            value = v;
        }
    }
    return value;
}
export class EnrichedAccumulator {
    pathIds = [];
    nodeIndex = new Map();
    len = 0;
    halfLen = 0;
    // State metric name → per-path-index value array. Insertion order = seed
    // order then first-seen order, matching the original derivation's series
    // ordering.
    stateMetrics = new Map();
    // Delta arbitration: mIdx → (pathIdx → value); winner = max pathIdx.
    blackContrib = new Map();
    whiteContrib = new Map();
    // Per-node set of mIdx it currently contributes (to diff on patch — an
    // adaptive window can shift which mIdx a node reports between packets).
    blackNodeMIdx = new Map();
    whiteNodeMIdx = new Map();
    // Materialised winners, indexed by mIdx.
    blackDeltas = [];
    whiteDeltas = [];
    /** (Re)configure for a path/palette/theme. Clears all accumulated state. */
    reset(config) {
        this.pathIds = config.pathIds;
        this.len = config.pathIds.length;
        this.halfLen = Math.ceil(this.len / 2);
        this.nodeIndex = new Map();
        for (let i = 0; i < this.len; i++)
            this.nodeIndex.set(config.pathIds[i], i);
        this.stateMetrics = new Map();
        for (const name of config.seedNames) {
            this.stateMetrics.set(name, new Array(this.len).fill(null));
        }
        this.blackContrib = new Map();
        this.whiteContrib = new Map();
        this.blackNodeMIdx = new Map();
        this.whiteNodeMIdx = new Map();
        this.blackDeltas = new Array(this.halfLen).fill(null);
        this.whiteDeltas = new Array(this.halfLen).fill(null);
    }
    /** Full derivation from a packet reader. Also the equivalence reference. */
    rebuild(getPacket) {
        for (let idx = 0; idx < this.len; idx++) {
            this.applyNode(idx, getPacket(this.pathIds[idx]));
        }
    }
    /**
     * Incremental: apply a single node's (possibly null) packet. O(1) amortised.
     * Returns true iff the node is on the current path (and was applied), so the
     * caller can skip republishing when an off-path node changed.
     */
    patchNode(nodeId, packet) {
        const idx = this.nodeIndex.get(nodeId);
        if (idx === undefined)
            return false; // node not on the current path
        this.applyNode(idx, packet);
        return true;
    }
    applyNode(idx, packet) {
        // ── State metrics ──────────────────────────────────────────────────────
        // Clear this index across all known metrics first (handles purge → null
        // and is harmless under the additive-merge common case), then set the
        // packet's metrics. New metric names lazy-initialise their array, matching
        // the original derivation's first-seen behaviour.
        for (const arr of this.stateMetrics.values())
            arr[idx] = null;
        let blackDeltas;
        let whiteDeltas;
        if (packet?.extra) {
            const turnMetrics = packet.extra.state?.[String(packet.turnNumber)];
            if (turnMetrics) {
                for (const [key, value] of Object.entries(turnMetrics)) {
                    let arr = this.stateMetrics.get(key);
                    if (!arr) {
                        arr = new Array(this.len).fill(null);
                        this.stateMetrics.set(key, arr);
                    }
                    arr[idx] = value;
                }
            }
            blackDeltas = packet.extra.black?.deltas;
            whiteDeltas = packet.extra.white?.deltas;
        }
        // ── Per-player deltas ──────────────────────────────────────────────────
        this.applyDeltas(idx, blackDeltas, this.blackContrib, this.blackNodeMIdx, this.blackDeltas);
        this.applyDeltas(idx, whiteDeltas, this.whiteContrib, this.whiteNodeMIdx, this.whiteDeltas);
    }
    applyDeltas(idx, deltas, contrib, nodeMIdx, materialised) {
        const oldSet = nodeMIdx.get(idx) ?? new Set();
        const newSet = new Set();
        if (deltas) {
            for (const [key, val] of Object.entries(deltas)) {
                const m = parseInt(key, 10);
                newSet.add(m);
                let c = contrib.get(m);
                if (!c) {
                    c = new Map();
                    contrib.set(m, c);
                }
                c.set(idx, val);
            }
        }
        // Drop this node's contribution to mIdx it no longer reports.
        for (const m of oldSet) {
            if (!newSet.has(m)) {
                const c = contrib.get(m);
                if (c) {
                    c.delete(idx);
                    if (c.size === 0)
                        contrib.delete(m);
                }
            }
        }
        nodeMIdx.set(idx, newSet);
        // Recompute the winner for every mIdx this node touched (added or removed).
        for (const m of oldSet)
            this.recomputeDelta(m, contrib, materialised);
        for (const m of newSet)
            this.recomputeDelta(m, contrib, materialised);
    }
    recomputeDelta(m, contrib, materialised) {
        const c = contrib.get(m);
        materialised[m] = c && c.size ? winnerByMaxIndex(c) : null;
    }
    /** Assemble the chart-ready result. Pure read of the accumulated state. */
    snapshot() {
        if (this.len === 0)
            return EMPTY_ENRICHED;
        const stateSeries = [];
        for (const [name, values] of this.stateMetrics) {
            stateSeries.push({
                name,
                data: values.map((v, i) => [i, v]), // fix the 2-element literal to the EnrichedSeries tuple-data shape
            });
        }
        return {
            stateSeries,
            // Colour is presentation and is applied by the consuming chart
            // (MergedDeltaPanel), not the data projection — keeping this unit pure
            // data (and free of `themeColor`, which is browser-only).
            deltaSeries: {
                black: [{
                        name: 'Black Delta',
                        data: this.blackDeltas.map((v, i) => [i, v]), // fix the 2-element literal to the tuple-data shape
                    }],
                white: [{
                        name: 'White Delta',
                        data: this.whiteDeltas.map((v, i) => [i, v]), // fix the 2-element literal to the tuple-data shape
                    }],
            },
        };
    }
}
