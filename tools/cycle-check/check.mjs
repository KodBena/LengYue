#!/usr/bin/env node
/**
 * tools/cycle-check/check.mjs
 *
 * Import-cycle ratchet (umbrella-level frontend tooling). Recovers the
 * `frontend/src` runtime import graph (via the shared tools/import-graph.mjs)
 * and reports its circular dependencies — strongly-connected components of the
 * VALUE-edge graph. A runtime import cycle is the structural precondition of
 * the vite-8.0.12 vitest-teardown deadlock (the `store ↔ services ↔ api-client`
 * cycle that `vi.mock` tipped into a hang; see PR #444), and is independently a
 * coupling smell.
 *
 * Edge semantics: only VALUE edges that resolve to a real in-src file
 * participate. `import type` / `export type` are compile-time-erased and do NOT
 * create runtime cycles, so they are excluded — which is exactly the
 * vite-relevant graph (the teardown deadlock is a runtime-module-graph
 * phenomenon). The walker's `typeOnly` flag carries this for free.
 *
 * Enforcement surface (ADR-0011 Rule 1): a build/CI gate, wired as a
 * NO-NEW-CYCLES RATCHET — cycle-presence is a crisp structural predicate
 * (gate-eligible, ADR-0011 Rule 5), but the measured baseline is NON-zero, so
 * `--check` gates on the count EXCEEDING the baseline, never on the baseline
 * itself (the band-conformance / doc-graph NO_NEW_*_RATCHET pattern; ADR-0011
 * Rule 3 measure-first). Two numbers ratchet, and EITHER exceeding the baseline
 * fails: `clusters` (count of cyclic SCCs — a new tangle) and `cyclicNodes`
 * (files participating in any cycle — an existing tangle growing). Both ratchet
 * DOWN as cycles are broken; lower the baseline in the same change.
 *
 * Usage:
 *   node tools/cycle-check/check.mjs            # human report
 *   node tools/cycle-check/check.mjs --check    # CI: no-new-cycles ratchet
 *   node tools/cycle-check/check.mjs --json     # structured output
 *   node tools/cycle-check/check.mjs --self-test # the probe-before-trust proofs
 *
 * Zero external dependencies: pure Node, no npm install. Tarjan's SCC below.
 *
 * License: Public Domain (The Unlicense)
 */
import { collectEdges } from "../import-graph.mjs";

// ── No-new-cycles ratchet ────────────────────────────────────────────────────

/**
 * Measured baseline of circular dependencies at adoption. `clusters` = number
 * of non-trivial strongly-connected components (cyclic clusters); `cyclicNodes`
 * = number of src files participating in any cycle. `--check` FAILS when either
 * exceeds its baseline (a new tangle, or an existing one growing). RATCHET DOWN,
 * never up: when a cycle is broken and a count drops, lower it here in the same
 * change and bump `baselineDate`. magic-literal: a measured snapshot, named
 * here as the single source (mirrors band-conformance's NO_NEW_FINDINGS_RATCHET).
 */
const NO_NEW_CYCLES_RATCHET = {
  baselineDate: "2026-06-21",
  // Measured at adoption HEAD: ONE cyclic cluster of 18 files — the
  // store/services/api-client tangle (the api-client→store `pushSystemMessage`
  // back-edge closes it). madge counts 15 elementary cycles within this one
  // SCC; the cluster + member count is the stable ratchet metric.
  clusters: 1,
  cyclicNodes: 18,
};

// ── Pure graph algorithms (driven by the self-test fixtures) ─────────────────

/**
 * Build the VALUE-edge adjacency over in-src targets. `edges` is the shared
 * walker's flat edge list; `srcFiles` bounds the node set. Returns
 * `{ nodes, adj }` where `adj` maps a node to the array of nodes it imports
 * (value edges only, resolving to a real src file).
 */
function buildGraph(srcFiles, edges) {
  const srcSet = new Set(srcFiles);
  const adj = new Map(srcFiles.map((f) => [f, []]));
  for (const e of edges) {
    if (e.typeOnly) continue; // compile-time-erased: no runtime cycle
    if (!e.exists) continue; // broken edge — band-conformance owns that class
    if (!srcSet.has(e.target)) continue; // .json/.css/generated/out-of-src
    if (!adj.has(e.from)) continue;
    adj.get(e.from).push(e.target);
  }
  return { nodes: srcFiles, adj };
}

/**
 * Tarjan's strongly-connected-components, iterative (no recursion-depth risk).
 * Returns an array of components, each an array of node ids. Linear in V+E.
 */
function tarjanSCCs(nodes, adj) {
  let index = 0;
  const idx = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const components = [];

  for (const start of nodes) {
    if (idx.has(start)) continue;
    // Explicit DFS stack of frames: { node, neighbors, i }.
    const work = [{ node: start, neighbors: adj.get(start) ?? [], i: 0 }];
    idx.set(start, index);
    low.set(start, index);
    index++;
    stack.push(start);
    onStack.add(start);

    while (work.length) {
      const frame = work[work.length - 1];
      if (frame.i < frame.neighbors.length) {
        const w = frame.neighbors[frame.i++];
        if (!idx.has(w)) {
          idx.set(w, index);
          low.set(w, index);
          index++;
          stack.push(w);
          onStack.add(w);
          work.push({ node: w, neighbors: adj.get(w) ?? [], i: 0 });
        } else if (onStack.has(w)) {
          low.set(frame.node, Math.min(low.get(frame.node), idx.get(w)));
        }
      } else {
        // Done with frame.node: if it is a root, pop its component.
        if (low.get(frame.node) === idx.get(frame.node)) {
          const comp = [];
          let w;
          do {
            w = stack.pop();
            onStack.delete(w);
            comp.push(w);
          } while (w !== frame.node);
          components.push(comp);
        }
        work.pop();
        if (work.length) {
          const parent = work[work.length - 1].node;
          low.set(parent, Math.min(low.get(parent), low.get(frame.node)));
        }
      }
    }
  }
  return components;
}

/** A node has a self-edge (imports itself — degenerate 1-node cycle). */
function hasSelfEdge(node, adj) {
  return (adj.get(node) ?? []).includes(node);
}

/** Cyclic SCCs: size ≥ 2, or a single node that imports itself. */
function nontrivialSCCs(components, adj) {
  return components.filter(
    (c) => c.length >= 2 || (c.length === 1 && hasSelfEdge(c[0], adj))
  );
}

/**
 * A representative (shortest) cycle through the SCC: BFS within the component
 * from its first node back to itself. Returns the node path closing the loop
 * (e.g. `[a, b, c, a]`). Used for the human report only.
 */
function representativeCycle(scc, adj) {
  const inScc = new Set(scc);
  const start = [...scc].sort()[0];
  if (hasSelfEdge(start, adj)) return [start, start];
  const parent = new Map([[start, null]]);
  const queue = [start];
  while (queue.length) {
    const u = queue.shift();
    for (const v of adj.get(u) ?? []) {
      if (!inScc.has(v)) continue;
      if (v === start) {
        // Close the loop: start → … → u → start.
        const path = [u];
        let p = u;
        while (parent.get(p) !== null) {
          p = parent.get(p);
          path.push(p);
        }
        path.reverse();
        path.push(start);
        return path;
      }
      if (!parent.has(v)) {
        parent.set(v, u);
        queue.push(v);
      }
    }
  }
  return [...scc]; // unreachable for a real SCC; defensive
}

/** Analyze a recovered graph into its cyclic clusters + counts. */
function analyze({ srcFiles, edges }) {
  const { nodes, adj } = buildGraph(srcFiles, edges);
  const components = tarjanSCCs(nodes, adj);
  const cyclicComps = nontrivialSCCs(components, adj).sort((a, b) => b.length - a.length);
  const cyclic = cyclicComps.map((members) => ({
    size: members.length,
    members: [...members].sort(),
    cycle: representativeCycle(members, adj),
  }));
  const cyclicNodes = cyclic.reduce((n, c) => n + c.size, 0);
  let valueEdges = 0;
  for (const list of adj.values()) valueEdges += list.length;
  return {
    counts: {
      nodes: nodes.length,
      valueEdges,
      clusters: cyclic.length,
      cyclicNodes,
    },
    cyclic,
  };
}

// ── Report ───────────────────────────────────────────────────────────────────

function printReport(r) {
  const out = [];
  const c = r.counts;
  out.push("cycle-check: import-cycle audit of frontend/src (runtime value edges)");
  out.push("");
  out.push(`  ${c.nodes} src files, ${c.valueEdges} runtime value edges.`);
  out.push(
    `  ${c.clusters} cyclic cluster(s), ${c.cyclicNodes} file(s) in a cycle.`
  );
  out.push("");
  out.push("── Circular dependencies (strongly-connected components) ──");
  if (r.cyclic.length === 0) {
    out.push("  none — the runtime import graph is acyclic.");
  } else {
    for (const cl of r.cyclic) {
      out.push(`  cluster of ${cl.size} — representative cycle:`);
      out.push("    " + cl.cycle.join("\n      → "));
      if (cl.size > cl.cycle.length - 1) {
        out.push(`    (all ${cl.size} members: ${cl.members.join(", ")})`);
      }
      out.push("");
    }
  }
  const { clusters, cyclicNodes, baselineDate } = NO_NEW_CYCLES_RATCHET;
  out.push("── No-new-cycles ratchet (gates --check) ──");
  out.push(
    `  clusters ${c.clusters}/${clusters}, cyclicNodes ${c.cyclicNodes}/${cyclicNodes} ` +
      `(baseline ${baselineDate}).`
  );
  if (c.clusters > clusters || c.cyclicNodes > cyclicNodes) {
    out.push("  EXCEEDED — a new import cycle (or an existing one grew). --check FAILS.");
    out.push("  Break the cycle in the PR that introduced it (the back-edge is usually a");
    out.push("  lower layer reaching up — inject a callback/event instead of importing up).");
  } else if (c.clusters < clusters || c.cyclicNodes < cyclicNodes) {
    out.push(`  Below baseline — ratchet down: set NO_NEW_CYCLES_RATCHET to ` +
      `{ clusters: ${c.clusters}, cyclicNodes: ${c.cyclicNodes} } (bump baselineDate).`);
  } else {
    out.push("  At baseline — no new cycles. --check passes.");
  }
  out.push("");
  return out.join("\n");
}

// ── Self-test (probe-before-trust: the net fires on a cycle, clean on a DAG) ─

function selfTest() {
  let passed = 0;
  let failed = 0;
  const log = (ok, name, detail) => {
    ok ? passed++ : failed++;
    process.stdout.write(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}\n`);
  };
  process.stdout.write("cycle-check self-test:\n");

  // Fixtures are synthetic { srcFiles, edges } — drive analyze() directly so the
  // SCC engine is proved on its literal shape (ADR-0011 Rule 3).
  const edge = (from, target, typeOnly = false) => ({ from, target, typeOnly, exists: true });

  // 1. A 3-node cycle a→b→c→a is one cyclic cluster of 3.
  {
    const r = analyze({
      srcFiles: ["a", "b", "c"],
      edges: [edge("a", "b"), edge("b", "c"), edge("c", "a")],
    });
    log(
      r.counts.clusters === 1 && r.counts.cyclicNodes === 3,
      "3-node cycle a→b→c→a is detected as one cluster of 3",
      `clusters=${r.counts.clusters} cyclicNodes=${r.counts.cyclicNodes}`
    );
  }
  // 2. A DAG a→b→c has NO cycles (no false positive).
  {
    const r = analyze({
      srcFiles: ["a", "b", "c"],
      edges: [edge("a", "b"), edge("b", "c")],
    });
    log(r.counts.clusters === 0, "acyclic DAG a→b→c yields zero clusters", `clusters=${r.counts.clusters}`);
  }
  // 3. A type-only back-edge does NOT form a runtime cycle (the vite-relevant rule).
  {
    const r = analyze({
      srcFiles: ["a", "b"],
      edges: [edge("a", "b"), edge("b", "a", /* typeOnly */ true)],
    });
    log(r.counts.clusters === 0, "type-only back-edge b→a does not form a runtime cycle", `clusters=${r.counts.clusters}`);
  }
  // 4. Two disjoint cycles are two clusters.
  {
    const r = analyze({
      srcFiles: ["a", "b", "c", "d"],
      edges: [edge("a", "b"), edge("b", "a"), edge("c", "d"), edge("d", "c")],
    });
    log(
      r.counts.clusters === 2 && r.counts.cyclicNodes === 4,
      "two disjoint 2-cycles are two clusters",
      `clusters=${r.counts.clusters}`
    );
  }
  // 5. A self-import a→a is a degenerate 1-node cycle.
  {
    const r = analyze({ srcFiles: ["a"], edges: [edge("a", "a")] });
    log(r.counts.clusters === 1, "self-import a→a is a degenerate cycle", `clusters=${r.counts.clusters}`);
  }

  process.stdout.write(`  → ${passed} passed, ${failed} failed\n`);
  return failed === 0;
}

// ── Driver ───────────────────────────────────────────────────────────────────

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--self-test")) {
    process.exit(selfTest() ? 0 : 1);
  }

  const { srcFiles, edges } = collectEdges();
  const r = analyze({ srcFiles, edges });

  if (argv.includes("--json")) {
    process.stdout.write(JSON.stringify(r, null, 2) + "\n");
    return;
  }

  process.stdout.write(printReport(r) + "\n");

  if (argv.includes("--check")) {
    const { clusters, cyclicNodes, baselineDate } = NO_NEW_CYCLES_RATCHET;
    if (r.counts.clusters > clusters || r.counts.cyclicNodes > cyclicNodes) {
      process.stderr.write(
        `\ncycle-check: NO-NEW-CYCLES RATCHET EXCEEDED (fatal) — clusters ` +
          `${r.counts.clusters} (baseline ${clusters}), cyclicNodes ${r.counts.cyclicNodes} ` +
          `(baseline ${cyclicNodes}, ${baselineDate}). A new import cycle, or an existing\n` +
          "cluster grew. A runtime import cycle is the structural precondition of the\n" +
          "vite-8.0.12 vitest-teardown deadlock (PR #444). Break the back-edge in the PR\n" +
          "that introduced it — a lower layer importing up is the usual culprit; inject a\n" +
          "callback/event instead. (The existing baseline does NOT gate — only the delta.)\n"
      );
      process.exit(1);
    }
    if (r.counts.clusters < clusters || r.counts.cyclicNodes < cyclicNodes) {
      process.stdout.write(
        `cycle-check: below baseline — ratchet down to { clusters: ${r.counts.clusters}, ` +
          `cyclicNodes: ${r.counts.cyclicNodes} } (bump baselineDate) in tools/cycle-check/check.mjs.\n`
      );
      return;
    }
    process.stdout.write(
      `cycle-check: at baseline (clusters ${clusters}, cyclicNodes ${cyclicNodes}) — no new cycles.\n`
    );
    return;
  }
}

main();
