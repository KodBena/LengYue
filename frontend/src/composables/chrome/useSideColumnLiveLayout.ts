/**
 * src/composables/chrome/useSideColumnLiveLayout.ts
 *
 * Dispatch L3 (`.claude/dispatch-reports/lyt-space-owner-spec.md` §3 step
 * 3, ledger rows 2447/2450/2460/2461): the thin composable wrapper around
 * `state/feasible-layout.ts`'s pure `resolveSideColumnLiveLayout` —
 * threads the DOM/store facts (the row's own live width, the two
 * persisted drag facts, `TreeWidget`'s own `useContentDemand` reading)
 * into the pure solve, and owns the ONE side effect the solve's own
 * output demands: pushing a `SovereignOverrideDiagnostic` through the
 * system-message channel (`pushSystemMessage`) — "your geometry
 * modification no longer permits X to render," per the commissioner's
 * own ruling that a starving drag is diagnosed, never resisted (ledger
 * rows 2379(3)/2443).
 *
 * **Push dedup.** The diagnostic is recomputed on every reactive tick the
 * pure solve recomputes (every `mousemove` of a held drag bumps
 * `sideColumnWidthPx`'s dependents indirectly via `treeSovereignPx`) —
 * pushing on every tick would flood the message log mid-drag. This
 * composable pushes only when the SET of starved regions changes (a new
 * region starts/stops starving), keyed by `location:starvedRegions`, not
 * on every recompute that reproduces the same diagnostic.
 *
 * License: Public Domain (The Unlicense)
 */
import { computed, watch, type Ref } from 'vue';
import { pushSystemMessage } from '../../services/system-message-sink';
import {
  resolveSideColumnLiveLayout,
  type LytScreenClassIdInput,
  type Px,
  type SideColumnFixedRegion,
  type SideColumnLiveLayoutResult,
} from '../../state/feasible-layout';
import type { LytTrackShape } from '../../state/lyt-layout-types';

export interface UseSideColumnLiveLayoutInput {
  /** `#tree-control-wrapper`'s own live DOM width (`sideColumnWidthPx`,
   *  `useResizablePanel.ts`). */
  readonly wrapperWidthPx: Ref<number>;
  readonly gapPx: number;
  readonly treeTrack: Ref<LytTrackShape>;
  /** `TreeWidget.vue`'s own exposed `contentDemandPx` (dispatch L2b's
   *  `useContentDemand` reading), threaded through unwired until this
   *  dispatch — the residual item that dispatch's own report named. */
  readonly treeMaxUsefulPx: Ref<Px | null>;
  /** `store.session.ui.treePanelWidthPx` — `undefined` means never
   *  dragged this session. */
  readonly treeSovereignPx: Ref<number | undefined>;
  readonly treeDefaultPx: Ref<number>;
  readonly others: Ref<readonly SideColumnFixedRegion[]>;
  readonly screenClassId: Ref<LytScreenClassIdInput>;
}

export function useSideColumnLiveLayout(input: UseSideColumnLiveLayoutInput): Ref<SideColumnLiveLayoutResult> {
  const layout = computed<SideColumnLiveLayoutResult>(() =>
    resolveSideColumnLiveLayout({
      wrapperWidthPx: input.wrapperWidthPx.value,
      gapPx: input.gapPx,
      tree: { track: input.treeTrack.value, maxUsefulPx: input.treeMaxUsefulPx.value },
      treeSovereignPx: input.treeSovereignPx.value,
      treeDefaultPx: input.treeDefaultPx.value,
      others: input.others.value,
      screenClassId: input.screenClassId.value,
    }),
  );

  let lastPushedKey = '';
  watch(
    () => layout.value.diagnostics,
    (diagnostics) => {
      if (diagnostics.length === 0) {
        lastPushedKey = '';
        return;
      }
      const key = diagnostics
        .map((d) => `${d.location}:${d.starved.map((s) => `${s.region}@${s.axis}`).join(',')}`)
        .join('|');
      if (key === lastPushedKey) return;
      lastPushedKey = key;
      // Dispatch L3 repair (`.claude/dispatch-reports/
      // lyt-space-owner-l3-review.md` §3 condition 3): thread the
      // diagnostic's own `remediation`/`nextAction` (ADR-0019 C8) through
      // to the sink's own structured `details` parameter, rather than
      // dropping them at this call site the way the pre-repair build did.
      for (const d of diagnostics) {
        pushSystemMessage('warning', d.message, { remediation: d.remediation, nextAction: d.nextAction });
      }
    },
  );

  return layout;
}
