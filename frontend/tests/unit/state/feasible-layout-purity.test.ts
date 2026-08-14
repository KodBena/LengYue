/**
 * tests/unit/state/feasible-layout-purity.test.ts
 *
 * Dispatch L4 (`.claude/dispatch-reports/lyt-space-owner-spec.md` §3 step
 * 4, ledger rows 2447/2484): the purity/path-equality CI gate that closes
 * Class 3. Per the spec's own §3 step 4 text: "the resulting `FeasibleLayout`
 * at each REVISITED geometry must be structurally equal ... regardless of
 * path — meaningful only once step 1 exists, because the equality it
 * asserts is over step 1's own output type," and per §3 step 4's own
 * "Mechanism" paragraph: "`FeasibleLayout.validate` is a pure function of
 * `(demands, candidate-from-solve, screenClassId, viewport)` with NO
 * in-place mutation of a previous result ... purity here is a CONSEQUENCE
 * of steps 1–3's own construction, not a separate mechanism bolted on."
 *
 * **What "purity" means in THIS suite, stated explicitly per this
 * dispatch's own instruction.** `FeasibleLayout.validate` and
 * `resolveSideColumnLiveLayout` are pure functions of their own EXPLICIT
 * arguments — no module-scope cache, no mutation of a shared input, no
 * dependency on call history. This suite proves exactly that property: for
 * a fixed geometry set and several traversal ORDERS between them (the
 * review's own §Class 3 traversal, plus three additional seeded/
 * deterministic randomized traversals), every geometry's own resolved
 * layout is compared against a CANONICAL, isolated computation for that
 * SAME geometry — computed once, outside any traversal, before any
 * traversal runs. A traversal step that diverges from the canonical value
 * (whether it is a first visit or a revisit) proves some form of hidden
 * state — a memoization cache keyed wrong, an accidental mutation of a
 * shared candidate/demands object between calls, an ordering dependency —
 * has crept into the pure layer.
 *
 * **What this suite does NOT claim, disclosed per the spec's own §4
 * step-4 risk row.** This is NOT a claim that a REAL `useContentDemand`
 * reading (§2's own runtime-content-dependent seam) is itself
 * path-independent in the live app — the spec's own risk register names
 * that as a SEPARATE, genuinely open question ("a `useContentDemand`
 * reading that is genuinely path-dependent... fails the gate honestly").
 * This suite controls for that entirely: `tree`'s own content-demand
 * overlay (`TREE_LIVE_CONTENT_OVERLAY`, dispatch L2b's own fixture) and
 * every `others` row fact are held CONSTANT across every traversal below
 * — purity is asserted about the PURE LAYER's own behavior given fixed
 * inputs, never about whether a live DOM measurement itself would stay
 * fixed across a real resize sequence. Every `describe` block below
 * states this in its own text, per this dispatch's own instruction, not
 * only here in the file header.
 *
 * **Geometry set.** The review's own §Class 3 traversal (`lyt-final-opus-
 * review.md`, cited via the spec's §3 step 4 text verbatim): 1920×1080 →
 * 480×900 → 2560×1440 → 1024×768 → 1080×1920 → 1366×768 → 900×600 →
 * 1920×1080 — a closed loop revisiting 1920×1080. The seven DISTINCT
 * points (the closing 1920×1080 is the same geometry as the first) are
 * this suite's own `GEOMETRIES` array below; every traversal is a
 * sequence of INDICES into that one array, so "the same geometry" always
 * means "the same array index," never a re-parsed width/height pair.
 *
 * **Mixed screen classes, deliberately.** The review's own traversal mixes
 * landscape-shaped (1920×1080, 2560×1440, 1024×768, 1366×768, 900×600) and
 * portrait-shaped (480×900, 1080×1920) points — this suite classifies each
 * by aspect (`widthPx >= heightPx` → landscape) for the `FeasibleLayout`-
 * level property (§A below), exercising BOTH compiled programs across one
 * traversal. The `resolveSideColumnLiveLayout`-level property (§B/§C
 * below) is scoped to the row's own LANDSCAPE track facts throughout
 * (matching `feasible-layout-geometry-sweep.test.ts`'s own disclosed
 * scoping, "portrait has no side-column concept") — `wrapperWidthPx` is
 * still re-derived per geometry via the SAME landscape root-row solve for
 * every point in the traversal, portrait-shaped points included; this
 * tests the PURE FUNCTION's own path-independence over its numeric input
 * domain, not whether a portrait screen would realistically reach this
 * code path in the live app (a purity property doesn't care which caller
 * would realistically supply which input).
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import {
  px,
  measuredFromLytProgram,
  FeasibleLayout,
  resolveSideColumnLiveLayout,
  resolveRootSplitLiveLayout,
  type Px,
  type SideColumnFixedRegion,
  type SideColumnLiveLayoutResult,
  type RootSplitLiveLayoutResult,
} from '../../../src/state/feasible-layout';
import { LYT_LANDSCAPE } from '../../../src/state/lyt-layout.gen';
import { LYT_PORTRAIT } from '../../../src/state/lyt-layout-portrait.gen';
import {
  TREE_LIVE_CONTENT_OVERLAY,
  computeLandscapeCandidate,
  computePortraitCandidate,
  toAllotmentMap,
  computeLandscapeSideColumnWidthPx,
  extractLandscapeSideColumnRowFacts,
  type Viewport,
} from './feasible-layout-fixtures';

// ── Geometry set — the review's own §Class 3 traversal, seven distinct
//    points (the traversal's own closing 1920x1080 is a REVISIT of index
//    0, not an eighth point). ──────────────────────────────────────────
interface NamedGeometry extends Viewport {
  readonly label: string;
}

const GEOMETRIES: readonly NamedGeometry[] = [
  { label: '1920x1080', widthPx: 1920, heightPx: 1080 },
  { label: '480x900', widthPx: 480, heightPx: 900 },
  { label: '2560x1440', widthPx: 2560, heightPx: 1440 },
  { label: '1024x768', widthPx: 1024, heightPx: 768 },
  { label: '1080x1920', widthPx: 1080, heightPx: 1920 },
  { label: '1366x768', widthPx: 1366, heightPx: 768 },
  { label: '900x600', widthPx: 900, heightPx: 600 },
];

function screenClassIdFor(g: NamedGeometry): 'landscape' | 'portrait' {
  return g.widthPx >= g.heightPx ? 'landscape' : 'portrait';
}

// ── Traversals: the review's own literal order, plus three additional
//    SEEDED/deterministic randomized traversals over the SAME geometry
//    set (this dispatch's own item 1 requirement: "at least three
//    additional randomized traversals ... seeded, deterministic"). ──────

/** mulberry32 — a small, dependency-free, deterministic PRNG. Same seed,
 *  same output sequence, every run/every machine (no `Math.random`
 *  anywhere in this file) — the "seeded, deterministic" requirement,
 *  satisfied without pulling in a new dependency for one test file. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fisherYatesShuffle(indices: readonly number[], rand: () => number): number[] {
  const a = [...indices];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Two independent shuffled passes over every geometry index, concatenated
 *  — GUARANTEES every geometry is revisited at least once (two passes,
 *  not left to chance the way a single long random walk would be), while
 *  the ORDER within and across passes is genuinely seed-randomized. */
function seededTraversal(seed: number): number[] {
  const rand = mulberry32(seed);
  const allIndices = GEOMETRIES.map((_, i) => i);
  return [...fisherYatesShuffle(allIndices, rand), ...fisherYatesShuffle(allIndices, rand)];
}

interface NamedTraversal {
  readonly name: string;
  readonly indices: readonly number[];
}

const TRAVERSALS: readonly NamedTraversal[] = [
  {
    name: 'the review\'s own §Class 3 traversal (1920x1080 -> 480x900 -> 2560x1440 -> 1024x768 -> 1080x1920 -> 1366x768 -> 900x600 -> 1920x1080)',
    indices: [0, 1, 2, 3, 4, 5, 6, 0],
  },
  { name: 'seeded randomized traversal #1 (seed=1001)', indices: seededTraversal(1001) },
  { name: 'seeded randomized traversal #2 (seed=2002)', indices: seededTraversal(2002) },
  { name: 'seeded randomized traversal #3 (seed=3003)', indices: seededTraversal(3003) },
];

// Sanity on the traversal-construction machinery itself — asserted once,
// not per describe block below, so a broken generator fails loudly at a
// single, easy-to-read location rather than as a wall of downstream
// purity failures that would misdirect a reader toward the wrong layer.
describe('traversal construction (sanity, not the purity property itself)', () => {
  it('the review\'s own literal traversal revisits its one repeated point (index 0, 1920x1080) — the spec\'s own traversal text, unmodified', () => {
    const [reviewTraversal] = TRAVERSALS;
    const counts = new Map<number, number>();
    for (const idx of reviewTraversal.indices) counts.set(idx, (counts.get(idx) ?? 0) + 1);
    expect(counts.get(0)).toBe(2); // 1920x1080, first and last
    for (let i = 1; i < GEOMETRIES.length; i += 1) expect(counts.get(i)).toBe(1);
  });

  it('every SEEDED traversal visits every geometry at least twice — genuine revisits, not left to chance (this dispatch\'s own item 1 requirement, applied to the three ADDITIONAL traversals)', () => {
    for (const trav of TRAVERSALS.slice(1)) {
      const counts = new Map<number, number>();
      for (const idx of trav.indices) counts.set(idx, (counts.get(idx) ?? 0) + 1);
      for (let i = 0; i < GEOMETRIES.length; i += 1) {
        expect(counts.get(i) ?? 0, `${trav.name}: geometry index ${i} (${GEOMETRIES[i].label})`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('the three seeded traversals are pairwise DIFFERENT orderings (the randomization is genuinely doing something, not three copies of one order)', () => {
    const [, seed1, seed2, seed3] = TRAVERSALS;
    expect(seed1.indices).not.toEqual(seed2.indices);
    expect(seed1.indices).not.toEqual(seed3.indices);
    expect(seed2.indices).not.toEqual(seed3.indices);
  });

  it('a given seed reproduces the IDENTICAL sequence on a second call — determinism, not merely "looks random once"', () => {
    expect(seededTraversal(1001)).toEqual(seededTraversal(1001));
    expect(seededTraversal(2002)).toEqual(seededTraversal(2002));
  });
});

// ── Float-tolerant structural comparison ────────────────────────────────
// "modulo float tolerance" (this dispatch's own SCOPE item 1): the numeric
// solver's own elastic-capped/elastic-fr distribution (`feasible-layout-
// fixtures.ts`'s own `solveRowTracks`) can produce fractional pixel
// values; the SAME deterministic arithmetic run twice on the SAME inputs
// is bit-for-bit reproducible in a single JS engine, but this suite
// normalizes before comparing anyway, per this dispatch's own explicit
// instruction, rather than relying on that reproducibility going
// unstated.
const EPSILON_PX = 1e-6;
function normalize(value: unknown): unknown {
  if (typeof value === 'number') return Math.round(value / EPSILON_PX) * EPSILON_PX;
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = normalize(v);
    return out;
  }
  return value;
}

// ── §A: FeasibleLayout.validate() purity, across BOTH compiled programs ─

type FeasibleSerialized =
  | { readonly kind: 'ok'; readonly screenClassId: string; readonly allotments: readonly { region: string; axis: string; px: number }[] }
  | { readonly kind: 'refused'; readonly diagnostics: readonly { kind: string; region: string; axis: string; demandPx: number; grantedPx: number }[] };

function computeFeasibleAt(g: NamedGeometry): FeasibleSerialized {
  const screenClassId = screenClassIdFor(g);
  const program = screenClassId === 'landscape' ? LYT_LANDSCAPE : LYT_PORTRAIT;
  const demands = measuredFromLytProgram(program, TREE_LIVE_CONTENT_OVERLAY);
  const candidate = screenClassId === 'landscape' ? computeLandscapeCandidate(g) : computePortraitCandidate(g);
  const result = FeasibleLayout.validate(demands, toAllotmentMap(candidate), screenClassId, {
    widthPx: px(g.widthPx),
    heightPx: px(g.heightPx),
  });
  if ('refused' in result) {
    return {
      kind: 'refused',
      diagnostics: [...result.refused]
        .map((d) => ({ kind: d.kind, region: d.region, axis: d.axis, demandPx: d.demandPx as number, grantedPx: d.grantedPx as number }))
        .sort((a, b) => a.region.localeCompare(b.region) || a.axis.localeCompare(b.axis)),
    };
  }
  return {
    kind: 'ok',
    screenClassId: result.screenClassId,
    allotments: [...result.allotments.values()]
      .map((a) => ({ region: a.region, axis: a.axis, px: a.px as number }))
      .sort((a, b) => a.region.localeCompare(b.region) || a.axis.localeCompare(b.axis)),
  };
}

describe('purity §A: FeasibleLayout.validate() — path-independence given FIXED demands/candidates, across the mixed-screen-class traversal', () => {
  // Purity claim, stated explicitly per this dispatch's own instruction:
  // `measuredFromLytProgram`'s own overlay (`TREE_LIVE_CONTENT_OVERLAY`,
  // tree's own live content-demand reading) and each geometry's own
  // numerically-solved candidate are recomputed FRESH at every traversal
  // step from the SAME fixed inputs (the compiled program, the overlay
  // constant, the geometry's own width/height) — nothing here is drawn
  // from a cache or a previous step's own output. This suite asserts that
  // `FeasibleLayout.validate`'s OWN resolution of those fixed inputs never
  // varies by the ORDER in which geometries were visited to reach it.
  const canonical = GEOMETRIES.map((g) => normalize(computeFeasibleAt(g)));

  for (const trav of TRAVERSALS) {
    it(`${trav.name}: every visited geometry matches its own isolated (canonical) computation`, () => {
      for (const idx of trav.indices) {
        const actual = normalize(computeFeasibleAt(GEOMETRIES[idx]));
        expect(actual, `geometry ${GEOMETRIES[idx].label} (index ${idx}) diverged from its canonical FeasibleLayout result`).toEqual(
          canonical[idx],
        );
      }
    });
  }
});

// ── §B: resolveSideColumnLiveLayout() purity, non-sovereign (un-dragged) ─

function landscapeSideColumnFixtures() {
  const facts = extractLandscapeSideColumnRowFacts();
  const others: readonly SideColumnFixedRegion[] = [
    { widgetId: 'controlPanel', track: facts.controlPanelTrack, desiredVisible: true, demote: facts.controlPanelDemote },
    { widgetId: 'previewBoard', track: facts.previewBoardTrack, desiredVisible: false, demote: null },
  ];
  // Row 2501 repair: `resolveSideColumnLiveLayout` now computes the
  // effective floor/ceiling relationship ITSELF (`effectiveDemandFloorPx`,
  // `src/state/feasible-layout.ts`) — this fixture passes the RAW live
  // reading (60px) unclamped, matching how the real composable
  // (`useSideColumnLiveLayout.ts`) actually supplies it in the live app
  // (an unclamped `TreeWidget.vue` content-demand reading). This purity
  // suite only asserts path-independence, never an absolute pixel value,
  // so this change affects nothing it checks.
  const treeMaxUsefulPx: Px = px(60);
  return { facts, others, treeMaxUsefulPx };
}

function serializeLive(result: SideColumnLiveLayoutResult): unknown {
  return {
    treePx: result.treePx,
    others: [...result.others].sort((a, b) => a.widgetId.localeCompare(b.widgetId)),
    diagnostics: [...result.diagnostics]
      .map((d) => ({ ...d, starved: [...d.starved].sort((a, b) => a.region.localeCompare(b.region)) }))
      .sort((a, b) => a.location.localeCompare(b.location)),
  };
}

describe('purity §B: resolveSideColumnLiveLayout() — non-sovereign, path-independence given FIXED row facts + FIXED content-demand overlay', () => {
  // Purity claim, stated explicitly: `others` (the controlPanel/
  // previewBoard row facts) and `tree.maxUsefulPx` (the content-demand
  // ceiling — a real `useContentDemand` reading, stood in here by the SAME
  // fixed 60px witnessed figure `feasible-layout-geometry-sweep.test.ts`
  // already uses, per this file's own header disclosure) are held CONSTANT
  // across every traversal step below — only `wrapperWidthPx` (re-derived
  // per geometry via the landscape root-row solve, scoped per this file's
  // header) varies. This is NOT a claim that a real content-demand reading
  // stays fixed across a real resize sequence — see this file's header.
  const { facts, others, treeMaxUsefulPx } = landscapeSideColumnFixtures();

  function computeLiveAt(g: NamedGeometry): unknown {
    const wrapperWidthPx = computeLandscapeSideColumnWidthPx(g);
    const result = resolveSideColumnLiveLayout({
      wrapperWidthPx,
      gapPx: facts.gapPx,
      tree: { track: facts.treeTrack, maxUsefulPx: treeMaxUsefulPx },
      treeSovereignPx: undefined, // non-sovereign — this describe block's own scope
      treeDefaultPx: 0,
      others,
      screenClassId: screenClassIdFor(g),
    });
    return normalize(serializeLive(result));
  }

  const canonical = GEOMETRIES.map((g) => computeLiveAt(g));

  for (const trav of TRAVERSALS) {
    it(`${trav.name}: every visited geometry matches its own isolated (canonical) non-sovereign result`, () => {
      for (const idx of trav.indices) {
        const actual = computeLiveAt(GEOMETRIES[idx]);
        expect(actual, `geometry ${GEOMETRIES[idx].label} (index ${idx}) diverged from its canonical non-sovereign result`).toEqual(
          canonical[idx],
        );
      }
    });
  }
});

// ── §C: resolveSideColumnLiveLayout() purity, SOVEREIGN (a persisted
//    override IS an input like any other — this dispatch's own SCOPE
//    item 3). ──────────────────────────────────────────────────────────

// Chosen (not arbitrary) so the traversal's own wrapperWidthPx values —
// 820 (1920x1080/2560x1440), 638 (1366x768), 345 (480x900/1024x768/
// 1080x1920/900x600), per `computeLandscapeSideColumnWidthPx`'s own
// deterministic output for this geometry set — span all THREE outcome
// shapes at once: 820 yields a genuine SIBLING starvation (controlPanel
// present but under-granted); 345 yields a genuine WRAPPER-capacity
// starvation (dispatch L4's own new mechanism, no sibling present to
// diagnose against); 638 yields a genuinely CLEAN fit (controlPanel
// absent by demote, tree's own 500px comfortably inside 638px) — so the
// sanity check below is not vacuous over a single shape.
const PERSISTED_SOVEREIGN_OVERRIDE_PX = 500;

describe('purity §C: resolveSideColumnLiveLayout() — SOVEREIGN override present, path-independence given a FIXED persisted override', () => {
  // Purity claim, stated explicitly (this dispatch's own SCOPE item 3):
  // a sovereign override is an ordinary input, carried verbatim across a
  // viewport change exactly as `useResizablePanel.ts`'s own persisted
  // `session.ui.treePanelWidthPx` is in the live app (`feasible-layout.ts`'s
  // own §2 measurement-seam table, "Sovereign override facts... carried
  // verbatim across a viewport change, already documented"). This describe
  // block holds `treeSovereignPx` FIXED at `PERSISTED_SOVEREIGN_OVERRIDE_PX`
  // across the ENTIRE traversal — the same drag value visited at every
  // geometry, matching how a real persisted override behaves — and asserts
  // the resolved `treePx`/`others`/`diagnostics` triple (INCLUDING the
  // dispatch L4 wrapper-capacity diagnostic, §1.6/this module's own
  // `wrapperCapacityStarvation`) is path-independent too.
  const { facts, others, treeMaxUsefulPx } = landscapeSideColumnFixtures();

  function computeLiveSovereignAt(g: NamedGeometry): unknown {
    const wrapperWidthPx = computeLandscapeSideColumnWidthPx(g);
    const result = resolveSideColumnLiveLayout({
      wrapperWidthPx,
      gapPx: facts.gapPx,
      tree: { track: facts.treeTrack, maxUsefulPx: treeMaxUsefulPx },
      treeSovereignPx: PERSISTED_SOVEREIGN_OVERRIDE_PX,
      treeDefaultPx: 0,
      others,
      screenClassId: screenClassIdFor(g),
    });
    return normalize(serializeLive(result));
  }

  const canonical = GEOMETRIES.map((g) => computeLiveSovereignAt(g));

  it('sanity: this traversal set genuinely exercises BOTH the diagnosed and the clean-fit sovereign branches (not a vacuous property over one shape)', () => {
    const withDiagnostics = canonical.filter((c) => (c as { diagnostics: readonly unknown[] }).diagnostics.length > 0);
    const withoutDiagnostics = canonical.filter((c) => (c as { diagnostics: readonly unknown[] }).diagnostics.length === 0);
    expect(withDiagnostics.length).toBeGreaterThan(0);
    expect(withoutDiagnostics.length).toBeGreaterThan(0);
  });

  for (const trav of TRAVERSALS) {
    it(`${trav.name}: every visited geometry matches its own isolated (canonical) sovereign result, diagnostics included`, () => {
      for (const idx of trav.indices) {
        const actual = computeLiveSovereignAt(GEOMETRIES[idx]);
        expect(actual, `geometry ${GEOMETRIES[idx].label} (index ${idx}) diverged from its canonical sovereign result`).toEqual(
          canonical[idx],
        );
      }
    });
  }
});

// ── §D: resolveRootSplitLiveLayout() purity — GAP A (`.claude/dispatch-
//    reports/lyt-cure-final-repair.md`, ledger rows 2502/2503): the root
//    split's own inputs (rowWidthPx/rowHeightPx/boardRailReservedPx, the
//    board-priority-clamp track's own fields, the sovereign override) are
//    part of the pure layer this gate polices, same as §B/§C above. ─────

function rootSplitFactsFromLandscape(): {
  fixedSiblingSumPx: number;
  naturalBoardCrossUnit: 'vh' | 'vw';
  minPx: number;
  maxPx: number;
  gapPx: number;
} {
  const sideColumnChild = LYT_LANDSCAPE.root.children[2];
  if (sideColumnChild.track.kind !== 'board-priority-clamp') {
    throw new Error('rootSplitFactsFromLandscape: root child "2" is not board-priority-clamp — encoding changed.');
  }
  return {
    fixedSiblingSumPx: sideColumnChild.track.fixedSiblingSumPx,
    naturalBoardCrossUnit: sideColumnChild.track.naturalBoardCrossUnit,
    minPx: sideColumnChild.track.minPx,
    maxPx: sideColumnChild.track.maxPx,
    gapPx: LYT_LANDSCAPE.root.gapPx,
  };
}

const ROOT_SPLIT_BOARD_FLOOR_PX = 300; // MIN_BOARD_PX (state/layout-model.ts) — this module does not import layout-model.ts (feasible-layout.ts's own header, "one-directional dependency"), so the literal is threaded the same way App.vue threads it at the real call site.

function serializeRootSplit(result: RootSplitLiveLayoutResult): unknown {
  return { sideColumnPx: result.sideColumnPx, boardUsefulPx: result.boardUsefulPx };
}

describe('purity §D: resolveRootSplitLiveLayout() — non-sovereign, path-independence given FIXED root-split facts, across the mixed-screen-class traversal', () => {
  // Purity claim: `board`/`sideColumn`/`gapPx`/`boardFloorPx` are held
  // CONSTANT (read once from the real compiled program, above) across
  // every traversal step; only `rowWidthPx`/`rowHeightPx` vary per
  // geometry — including the PORTRAIT-shaped points in the traversal,
  // exercising this function's own numeric domain without regard to
  // whether a portrait screen would realistically reach this code path
  // in the live app (App.vue itself gates this LANDSCAPE-only — see
  // `rootSplitLayout`'s own header — but the pure function underneath
  // has no such gate, and this suite is about THAT function's own
  // path-independence property).
  const facts = rootSplitFactsFromLandscape();

  function computeRootSplitAt(g: NamedGeometry): unknown {
    const result = resolveRootSplitLiveLayout({
      rowWidthPx: g.widthPx,
      rowHeightPx: g.heightPx,
      gapPx: facts.gapPx,
      boardRailReservedPx: 0,
      board: { fixedSiblingSumPx: facts.fixedSiblingSumPx, naturalBoardCrossUnit: facts.naturalBoardCrossUnit },
      sideColumn: { minPx: facts.minPx, maxPx: facts.maxPx },
      boardFloorPx: ROOT_SPLIT_BOARD_FLOOR_PX,
      sovereignWrapperPx: undefined,
    });
    return normalize(serializeRootSplit(result));
  }

  const canonical = GEOMETRIES.map((g) => computeRootSplitAt(g));

  for (const trav of TRAVERSALS) {
    it(`${trav.name}: every visited geometry matches its own isolated (canonical) non-sovereign root-split result`, () => {
      for (const idx of trav.indices) {
        const actual = computeRootSplitAt(GEOMETRIES[idx]);
        expect(actual, `geometry ${GEOMETRIES[idx].label} (index ${idx}) diverged from its canonical root-split result`).toEqual(
          canonical[idx],
        );
      }
    });
  }
});

describe('purity §E: resolveRootSplitLiveLayout() — SOVEREIGN override present, path-independence given a FIXED persisted override', () => {
  const facts = rootSplitFactsFromLandscape();
  const SOVEREIGN_PX = 500;

  function computeRootSplitSovereignAt(g: NamedGeometry): unknown {
    const result = resolveRootSplitLiveLayout({
      rowWidthPx: g.widthPx,
      rowHeightPx: g.heightPx,
      gapPx: facts.gapPx,
      boardRailReservedPx: 0,
      board: { fixedSiblingSumPx: facts.fixedSiblingSumPx, naturalBoardCrossUnit: facts.naturalBoardCrossUnit },
      sideColumn: { minPx: facts.minPx, maxPx: facts.maxPx },
      boardFloorPx: ROOT_SPLIT_BOARD_FLOOR_PX,
      sovereignWrapperPx: SOVEREIGN_PX,
    });
    return normalize(serializeRootSplit(result));
  }

  const canonical = GEOMETRIES.map((g) => computeRootSplitSovereignAt(g));

  it('sanity: the sovereign result is the SAME sideColumnPx at every geometry (verbatim pass-through), while boardUsefulPx still varies by rowHeightPx — proving the informational field is not accidentally frozen too', () => {
    const sideColumnValues = new Set(canonical.map((c) => (c as { sideColumnPx: number }).sideColumnPx));
    const boardUsefulValues = new Set(canonical.map((c) => (c as { boardUsefulPx: number }).boardUsefulPx));
    expect(sideColumnValues.size).toBe(1);
    expect([...sideColumnValues][0]).toBe(SOVEREIGN_PX);
    expect(boardUsefulValues.size).toBeGreaterThan(1);
  });

  for (const trav of TRAVERSALS) {
    it(`${trav.name}: every visited geometry matches its own isolated (canonical) sovereign root-split result`, () => {
      for (const idx of trav.indices) {
        const actual = computeRootSplitSovereignAt(GEOMETRIES[idx]);
        expect(actual, `geometry ${GEOMETRIES[idx].label} (index ${idx}) diverged from its canonical sovereign root-split result`).toEqual(
          canonical[idx],
        );
      }
    });
  }
});

// ── §F: resolveRootSplitLiveLayout() purity, EXPLICITLY across a
//    screen-class swap — row 2502/2503 review repair, finding 2
//    ("SCREEN-CLASS FREEZE"). §D/§E's own mixed-class traversals already
//    exercise this property implicitly (the GEOMETRIES array interleaves
//    landscape- and portrait-shaped points); this block names it
//    explicitly and narrowly, matching the coordinator's own instruction
//    that the purity suite cover the class-swap path directly rather
//    than only by inference from a broader traversal. This is the PURE
//    LAYER'S half of finding 2 — proving `resolveRootSplitLiveLayout`
//    itself carries no hidden state across a landscape/portrait swap;
//    the STATEFUL half (a live `ResizeObserver` orphaned by the DOM
//    element a screen-class swap replaces) is a `useResizablePanel.ts`
//    concern with its own dedicated integration coverage
//    (`tests/integration/lyt-root-split-live.test.ts`'s own
//    `reattachObservers()` describe block), not a purity-suite property
//    — a live DOM/observer lifecycle isn't a pure function of its
//    explicit arguments the way this suite's other properties are. ────

describe('purity §F: resolveRootSplitLiveLayout() — explicit screen-class-swap sequence (landscape -> portrait-shaped -> landscape), no cross-contamination', () => {
  const facts = rootSplitFactsFromLandscape();

  function computeAt(g: NamedGeometry): unknown {
    return normalize(
      serializeRootSplit(
        resolveRootSplitLiveLayout({
          rowWidthPx: g.widthPx,
          rowHeightPx: g.heightPx,
          gapPx: facts.gapPx,
          boardRailReservedPx: 0,
          board: { fixedSiblingSumPx: facts.fixedSiblingSumPx, naturalBoardCrossUnit: facts.naturalBoardCrossUnit },
          sideColumn: { minPx: facts.minPx, maxPx: facts.maxPx },
          boardFloorPx: ROOT_SPLIT_BOARD_FLOOR_PX,
          sovereignWrapperPx: undefined,
        }),
      ),
    );
  }

  const LANDSCAPE_1920 = GEOMETRIES[0]; // 1920x1080
  const PORTRAIT_480 = GEOMETRIES[1]; // 480x900
  const LANDSCAPE_1366 = GEOMETRIES[5]; // 1366x768

  it('a landscape result revisited after an intervening portrait-shaped call is byte-identical to the same landscape geometry\'s own isolated (canonical) result', () => {
    const canonicalLandscape1920 = computeAt(LANDSCAPE_1920);
    const canonicalLandscape1366 = computeAt(LANDSCAPE_1366);

    // The explicit swap sequence: landscape, portrait-shaped, landscape
    // again, portrait-shaped again, a DIFFERENT landscape geometry — no
    // memoization, no module-scope cache, nothing carried between calls.
    const seq1 = computeAt(LANDSCAPE_1920);
    const seq2 = computeAt(PORTRAIT_480);
    const seq3 = computeAt(LANDSCAPE_1920);
    const seq4 = computeAt(PORTRAIT_480);
    const seq5 = computeAt(LANDSCAPE_1366);

    expect(seq1).toEqual(canonicalLandscape1920);
    expect(seq3).toEqual(canonicalLandscape1920); // revisit after a portrait-shaped call: unchanged
    expect(seq2).toEqual(seq4); // the portrait-shaped call itself is ALSO path-independent, revisited
    expect(seq5).toEqual(canonicalLandscape1366); // a DIFFERENT landscape geometry, immediately after: no leakage from either prior call
  });

  it('the SOVEREIGN path is equally immune to an intervening screen-class-shaped call', () => {
    const sovereignAt = (g: NamedGeometry): unknown =>
      normalize(
        serializeRootSplit(
          resolveRootSplitLiveLayout({
            rowWidthPx: g.widthPx,
            rowHeightPx: g.heightPx,
            gapPx: facts.gapPx,
            boardRailReservedPx: 0,
            board: { fixedSiblingSumPx: facts.fixedSiblingSumPx, naturalBoardCrossUnit: facts.naturalBoardCrossUnit },
            sideColumn: { minPx: facts.minPx, maxPx: facts.maxPx },
            boardFloorPx: ROOT_SPLIT_BOARD_FLOOR_PX,
            sovereignWrapperPx: 500,
          }),
        ),
      );
    const canonical = sovereignAt(LANDSCAPE_1920);
    const afterPortraitShapedCall = (() => {
      sovereignAt(PORTRAIT_480);
      return sovereignAt(LANDSCAPE_1920);
    })();
    expect(afterPortraitShapedCall).toEqual(canonical);
  });
});
