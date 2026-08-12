/**
 * src/composables/chrome/useLytActivityInvariance.ts
 *
 * METAMODEL WAVE, item 2c (ledger row 2157/2184/2185, branch
 * lyt-model-loop-experiment, NOT merged without ratification). L6
 * (activity invariance), per the rev 2 domain-model consult
 * (`.claude/dispatch-reports/lyt-domain-model-proposal.md` §2.2):
 *
 *   "For every slot, the solved partition is invariant across the
 *    slot's declared activity states. An activity state selects which
 *    content paints inside a reservation; it never selects a
 *    reservation, a presence, or a tree."
 *
 * L6a (a system-driven `@toggle(system, release)` is unrepresentable) is
 * already true at construction time (`research/lyt/lyt_ast.py`'s own
 * `Presence.__post_init__`) — nothing to add here.
 *
 * L6b, as this module implements it -- disclosed scope, read before
 * relying on the "load refusal" framing the commission text uses.
 * ------------------------------------------------------------------
 * The commission's own words: "a leaf whose widget declares activity
 * states must carry an envelope over exactly those states — missing or
 * excess states are load refusals." A literal "missing envelope is
 * always a violation" reading is FALSE against the real registry: `B`,
 * `I_board`, `tree`, and `CP-analysis` all genuinely vary by activity
 * state (`activeBoard` present or not) and correctly carry NO envelope
 * at all — their reservation is a fixed/aspect-locked constant, and
 * their content simply paints nothing when absent. That is the domain
 * model's own POSITIVE template (its `HandicapPanel` / board-scoped-leaf
 * census entries), not a defect; enforcing "missing envelope = refusal"
 * against them would flag every one of these correctly-shaped leaves.
 *
 * The rule this module DOES enforce, honestly narrower: for a leaf whose
 * widget registry entry declares `activityStates`, IF that leaf ALSO
 * declares an envelope (`envelopeStates != null`), the two sets MUST
 * match exactly — catching DRIFT between the registry's own component
 * sweep and the `.lyt` encoding's own declaration (an ADR-0012 P1
 * two-writers-of-one-truth check), never asserting that every
 * activity-varying widget must own an envelope. Whether the STRONGER
 * "every activity-varying leaf must be envelope-reserved" rule should
 * become a real load refusal is a design question the domain-model
 * proposal itself (§2.2, §6 fork 3) leaves to the commissioner — "does
 * the widget registry grow a per-widget activity-state-set column?" is
 * answered YES here (it does — `lyt-widget-registry.ts`'s
 * `activityStates` field); whether its ABSENCE should gate load is not
 * decided by this module.
 *
 * L6c (no structural variant may be selected by an activity state) is
 * item 3's own concern (variant families) and is not checked here.
 *
 * Enforcement surface (ADR-0011 Rule 1, stated honestly): this module is
 * a pure, directly-testable function, exercised by a dedicated Vitest
 * suite (`tests/unit/lyt-activity-invariance.test.ts`) — it is NOT wired
 * into App.vue's boot path this wave. Wiring it as a hard runtime/build
 * gate is deferred, disclosed as follow-up: doing so honestly would
 * first require sweeping every remaining widget's own v-if/gating logic
 * (this wave verified five: B, I_board, tree, CP-analysis, I_metrics)
 * rather than leaving most registry entries `activityStates: null` and
 * therefore invisible to the check.
 *
 * License: Public Domain (The Unlicense)
 */
import type { LytProgram, LytNodeData } from '../../state/lyt-layout.gen';
import { LYT_WIDGET_REGISTRY, type LytWidgetRegistryEntry } from '../../state/lyt-widget-registry';

export interface LytActivityInvarianceViolation {
  readonly widget: string;
  readonly registryActivityStates: readonly string[];
  readonly envelopeStates: readonly string[];
  readonly reason: 'missing-states' | 'excess-states' | 'set-mismatch';
}

/**
 * Walks `program.root`, and for every LEAF whose widget id has a
 * registered, non-null `activityStates` set AND a declared envelope
 * (`envelopeStates != null`), compares the two sets. Returns one
 * violation per mismatched leaf — empty when every checked leaf agrees
 * (the dormancy case: a leaf with no registry `activityStates`, or no
 * declared envelope, is simply not checked, the same "the law binds
 * declarations, it does not retroactively indict silence" posture every
 * other METAMODEL WAVE law already takes).
 */
export function checkActivityInvarianceL6(
  program: LytProgram,
  registry: Readonly<Record<string, LytWidgetRegistryEntry>> = LYT_WIDGET_REGISTRY,
): LytActivityInvarianceViolation[] {
  const violations: LytActivityInvarianceViolation[] = [];
  walk(program.root, registry, violations);
  return violations;
}

function walk(
  node: LytNodeData,
  registry: Readonly<Record<string, LytWidgetRegistryEntry>>,
  out: LytActivityInvarianceViolation[],
): void {
  if (node.kind === 'leaf') {
    const entry = registry[node.widget];
    const activityStates = entry?.activityStates ?? null;
    const envelopeStates = node.envelopeStates ?? null;
    if (activityStates && envelopeStates) {
      const declared = new Set(activityStates);
      const found = new Set(envelopeStates);
      const missing = activityStates.filter((s) => !found.has(s));
      const excess = envelopeStates.filter((s) => !declared.has(s));
      if (missing.length > 0 || excess.length > 0) {
        out.push({
          widget: node.widget,
          registryActivityStates: activityStates,
          envelopeStates,
          reason:
            missing.length > 0 && excess.length > 0
              ? 'set-mismatch'
              : missing.length > 0
                ? 'missing-states'
                : 'excess-states',
        });
      }
    }
    return;
  }
  if (node.kind === 'split') {
    for (const child of node.children) walk(child.node, registry, out);
    return;
  }
  if (node.kind === 'exclusive') {
    for (const child of node.children) walk(child.node, registry, out);
    return;
  }
  // 'blackbox' (a collapsed Exclusive) carries no leaf of its own.
}
