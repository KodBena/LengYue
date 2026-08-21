/**
 * tests/unit/lyt-activity-invariance.test.ts
 *
 * METAMODEL WAVE, item 2c (ledger row 2157/2184-2186, branch
 * lyt-model-loop-experiment, NOT merged without ratification). Coverage
 * for `checkActivityInvarianceL6` (`src/composables/chrome/
 * useLytActivityInvariance.ts`) — see that module's own header for the
 * full disposition of what L6 does and deliberately does NOT enforce
 * this wave (a drift check between a leaf's declared envelope and its
 * widget's registry-declared `activityStates`, not a "missing envelope
 * is always a violation" gate).
 *
 * M2 STAGE F1 PORT (2026-08-12, ledger row 2311 disposition 2): ported
 * from the experiment tree onto mainline, with ONE disclosed adaptation —
 * the experiment's own "positive witness" case used `I_metrics` (a leaf
 * whose registry `activityStates` and whose compiled `envelopeStates`
 * agree). `I_metrics` is NOT a mainline widget — mainline never adopted
 * the experiment's four-band toolbar split (`lyt-widget-registry.ts`'s own
 * header explains why); mainline's ONE `envelope: {disconnected,
 * connected}` declaration wraps the `A_engine` composite's own containing
 * Split slot, not a bare leaf, so mainline currently has NO leaf carrying
 * both a registry `activityStates` entry AND a compiled `envelopeStates`
 * — the positive-witness case has no honest mainline analog this wave.
 * Replaced with a test that states this dormancy explicitly (see
 * `it('no leaf ...')` below) rather than asserting a false fact about a
 * widget mainline doesn't have. Every other case (the four real-program
 * checks, the synthetic drift fixtures) transfers unchanged — mainline's
 * registry and compiled programs still exhibit the same B/I_board/tree/
 * CP-analysis positive-template shape the experiment's own test describes.
 * The synthetic fixture's leaf literal is also adapted: mainline's
 * `LytLeafNode` doesn't carry `unitAxes`/`wrapPolicy` (the F1 port's own
 * disclosed narrowing — see `emit_layout_tree.py`'s module docstring) but
 * does carry `elasticAxes`/`ceilingAxes`/`floorAxes`/`edgeAxes`/
 * `orientation`/`activity`/`demote` alongside `envelopeStates`.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { checkActivityInvarianceL6 } from '../../src/composables/chrome/useLytActivityInvariance';
import { LYT_LANDSCAPE } from '../../src/state/lyt-layout.gen';
import { LYT_PORTRAIT } from '../../src/state/lyt-layout-portrait.gen';
import { LYT_WIDGET_REGISTRY, type LytWidgetRegistryEntry } from '../../src/state/lyt-widget-registry';
import type { LytProgram } from '../../src/state/lyt-layout.gen';

describe('checkActivityInvarianceL6 — the real compiled programs', () => {
  it('landscape: zero violations (dormant this wave — see the disclosed-adaptation note above)', () => {
    expect(checkActivityInvarianceL6(LYT_LANDSCAPE)).toEqual([]);
  });

  it('portrait: zero violations (same dormancy, same registry)', () => {
    expect(checkActivityInvarianceL6(LYT_PORTRAIT)).toEqual([]);
  });

  it('no leaf on mainline carries both a registry activityStates entry AND a compiled envelope this wave (disclosed adaptation from the experiment\'s I_metrics witness)', () => {
    // Mainline's ONE envelope declaration (`envelope: {disconnected,
    // connected}`) wraps A_engine's own containing Split slot, not a bare
    // leaf, so no leaf in either compiled program satisfies the checker's
    // own "both sides declared" precondition — the zero-violations result
    // above is real (the checker ran against every leaf) but every leaf's
    // own check is a dormancy case, not an agreement case, this wave.
    for (const program of [LYT_LANDSCAPE, LYT_PORTRAIT]) {
      walkLeaves(program.root, (leaf) => {
        const entry = LYT_WIDGET_REGISTRY[leaf.widget];
        if (entry?.activityStates && leaf.envelopeStates) {
          throw new Error(
            `expected no leaf to carry both — found ${leaf.widget} with ` +
              `registry activityStates ${JSON.stringify(entry.activityStates)} and ` +
              `compiled envelopeStates ${JSON.stringify(leaf.envelopeStates)}`,
          );
        }
      });
    }
  });

  it('dormancy: a leaf with no registry activityStates (most of the registry) is not checked at all, even though it may carry its own envelope or none', () => {
    // A_engine itself is no longer a widget id at all — M2 stage B2b
    // (`.claude/dispatch-reports/lyt-boot-restoration.md`) retired it a
    // second time into four independent sub-leaves (mainline's own
    // post-B2b "three-vocabulary engine decomposition"), none of which
    // carry an `activityStates` registry entry -- confirms the checker
    // does not invent a violation for a widget nobody has swept.
    for (const widget of ['A_engine_controls', 'A_engine_eval', 'A_engine_health', 'A_engine_queue']) {
      expect(LYT_WIDGET_REGISTRY[widget].activityStates).toBeNull();
    }
  });

  it("the domain model's own positive template (B/I_board/tree/CP-analysis) is NOT flagged despite declaring activityStates with no envelope", () => {
    // This is the disclosed-scope assertion itself: these four leaves are
    // exactly the shape a literal "missing envelope is a violation" rule
    // would wrongly flag. They carry NO envelope (fixed/aspect-locked
    // reservations) and the checker does not check leaves with envelopeStates
    // === null against the registry at all.
    for (const widget of ['B', 'I_board', 'tree', 'CP-analysis']) {
      const entry = LYT_WIDGET_REGISTRY[widget];
      expect(entry.activityStates).not.toBeNull();
      const leaf = findLeaf(LYT_LANDSCAPE, widget) ?? findLeaf(LYT_PORTRAIT, widget);
      expect(leaf?.envelopeStates ?? null).toBeNull();
    }
    // Every real program still resolves to zero violations (asserted
    // above) — these four leaves are silently unchecked, not silently
    // passed.
  });
});

describe('checkActivityInvarianceL6 — synthetic drift fixtures', () => {
  const registry: Readonly<Record<string, LytWidgetRegistryEntry>> = {
    Widget: {
      widget: 'Widget',
      component: 'Fixture',
      status: 'mounted',
      slotName: '#leaf-Widget',
      absorbedInto: null,
      activityStates: ['stateA', 'stateB'],
      note: 'fixture',
    },
  };

  function programWithEnvelope(envelopeStates: readonly string[] | null): LytProgram {
    return {
      classId: 'fixture',
      root: {
        kind: 'split',
        axis: 'h',
        gapPx: 0,
        children: [
          {
            path: '0',
            presenceDefaultVisible: true,
            track: { kind: 'fixed', px: 10 },
            node: {
              kind: 'leaf',
              widget: 'Widget',
              domain: 'chrome',
              facets: ['action'],
              aspect: null,
              scrollAxes: [],
              content: null,
              elasticAxes: [],
              ceilingAxes: [],
              floorAxes: [],
              edgeAxes: [],
              orientation: 'v',
              activity: null,
              demote: null,
              envelopeStates,
            },
          },
        ],
      },
    };
  }

  it('agreeing sets: zero violations', () => {
    const program = programWithEnvelope(['stateA', 'stateB']);
    expect(checkActivityInvarianceL6(program, registry)).toEqual([]);
  });

  it('a missing state (the envelope declares fewer than the registry): one violation, reason missing-states', () => {
    const program = programWithEnvelope(['stateA']);
    const violations = checkActivityInvarianceL6(program, registry);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      widget: 'Widget',
      reason: 'missing-states',
      registryActivityStates: ['stateA', 'stateB'],
      envelopeStates: ['stateA'],
    });
  });

  it('an excess state (the envelope declares MORE than the registry knows about): one violation, reason excess-states', () => {
    const program = programWithEnvelope(['stateA', 'stateB', 'stateC']);
    const violations = checkActivityInvarianceL6(program, registry);
    expect(violations).toHaveLength(1);
    expect(violations[0].reason).toBe('excess-states');
  });

  it('a disjoint set (neither subset nor superset): one violation, reason set-mismatch', () => {
    const program = programWithEnvelope(['stateC', 'stateD']);
    const violations = checkActivityInvarianceL6(program, registry);
    expect(violations).toHaveLength(1);
    expect(violations[0].reason).toBe('set-mismatch');
  });

  it('no envelope declared at all: not checked, zero violations regardless of the registry set', () => {
    const program = programWithEnvelope(null);
    expect(checkActivityInvarianceL6(program, registry)).toEqual([]);
  });

  it('no registry activityStates for the widget: not checked, zero violations regardless of the envelope', () => {
    const program = programWithEnvelope(['anything']);
    const emptyRegistry: Readonly<Record<string, LytWidgetRegistryEntry>> = {
      Widget: { ...registry.Widget, activityStates: null },
    };
    expect(checkActivityInvarianceL6(program, emptyRegistry)).toEqual([]);
  });
});

function findLeaf(program: LytProgram, widgetId: string) {
  return findLeafNode(program.root, widgetId);
}

function findLeafNode(node: LytProgram['root']['children'][number]['node'], widgetId: string): { envelopeStates: readonly string[] | null } | null {
  if (node.kind === 'leaf') {
    return node.widget === widgetId ? node : null;
  }
  if (node.kind === 'split' || node.kind === 'exclusive') {
    for (const child of node.children) {
      const found = findLeafNode(child.node, widgetId);
      if (found) return found;
    }
  }
  return null;
}

function walkLeaves(
  node: LytProgram['root']['children'][number]['node'],
  visit: (leaf: { widget: string; envelopeStates: readonly string[] | null }) => void,
): void {
  if (node.kind === 'leaf') {
    visit(node);
    return;
  }
  if (node.kind === 'split' || node.kind === 'exclusive') {
    for (const child of node.children) walkLeaves(child.node, visit);
  }
}
