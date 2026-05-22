/**
 * src/composables/analysis/useEChartsForestRender.ts
 *
 * Manages the per-tree ECharts lifecycle for the card-tree widget:
 * one chart instance per `RenderTree`, ResizeObserver-driven
 * re-layout, click and hover wiring with payload extraction.
 *
 * Effects: yes — ECharts init/dispose, ResizeObserver attach/detach,
 * DOM event subscriptions. Owned by this composable so the SFC
 * stays small. The composable is generic over the payload type
 * (`P`) the caller threads through `EChartsTreeNode.payload`.
 *
 * License: Public Domain (The Unlicense)
 */

import { onUnmounted, watch } from 'vue';
import * as echarts from 'echarts';
import type { EChartsTreeNode } from '../../components/charts/card-tree-echarts';
import { themeColor } from '../../utils/theme-color';
import { store } from '../../store';

export interface ForestChartConfig<P> {
  /** Per-tree key (stable identifier ECharts instances are stored under). */
  treeKey: string;
  /** Container HTMLElement (one per tree). */
  el: HTMLElement;
  /** Root ECharts node, fully converted from the projection. */
  data: EChartsTreeNode;
  /** Layout orientation per tree. */
  orient: 'LR' | 'TB';
  /** Total rendered nodes — used to disable animations on huge trees. */
  renderedNodeCount: number;
  /** Tooltip formatter; receives the payload threaded via `EChartsTreeNode`. */
  tooltipFor: (payload: P) => string;
  /** Click handler; payload comes back unwrapped. */
  onClick: (payload: P) => void;
  /** Hover handler. Coordinates are the native mouse offsets. */
  onHover: (payload: P, x: number, y: number) => void;
  /** Symmetric leave handler. */
  onLeave: () => void;
}

export interface ForestChartHandle<P> {
  /**
   * (Re-)render charts for the current set of trees. Tears down any
   * chart whose key no longer appears in the input and inits any new
   * key seen for the first time. Caller is responsible for invoking
   * after the v-for refs have populated (typically inside a
   * `watch(..., async () => { await nextTick(); syncCharts(...); })`).
   *
   * Imperative on purpose: an earlier `Ref<configs>`-driven version
   * required a reactive container map, and that turned out to write
   * back into reactivity from inside the template's `:ref` callback
   * — Vue caught the cycle and bailed with "Maximum recursive
   * updates exceeded." Driving sync from outside the render keeps
   * the data flow one-way.
   */
  syncCharts: (configs: ForestChartConfig<P>[]) => void;
}

/**
 * Imperative chart-lifecycle owner. The composable disposes
 * everything on unmount; the caller drives `syncCharts` from a
 * watch they own.
 */
export function useEChartsForestRender<P>(): ForestChartHandle<P> {
  const instances = new Map<string, echarts.ECharts>();
  const observers = new Map<string, ResizeObserver>();

  function destroy(key: string): void {
    const inst = instances.get(key);
    if (inst) {
      inst.dispose();
      instances.delete(key);
    }
    const obs = observers.get(key);
    if (obs) {
      obs.disconnect();
      observers.delete(key);
    }
  }

  function ensure(cfg: ForestChartConfig<P>): echarts.ECharts | null {
    if (cfg.el.clientWidth < 10 || cfg.el.clientHeight < 10) return null;
    let inst = instances.get(cfg.treeKey);
    if (!inst) {
      // No ECharts theme passed — the built-in 'dark' theme would
      // overlay a dark canvas backgroundColor and a dark default
      // lineStyle that ignores the app's substrate. We set every
      // visible color via the explicit setOption below (canvas
      // backgroundColor: 'transparent' lets the container's CSS bg
      // show through; lineStyle.color reads from --border-3 via
      // themeColor()), so the chart inherits the active theme rather
      // than ECharts' theme defaults.
      inst = echarts.init(cfg.el, undefined, { renderer: 'svg' });
      instances.set(cfg.treeKey, inst);

      // ECharts' callback param shape is loose; the `data` field on
      // a tree-series datum is exactly what we passed in
      // (`EChartsTreeNode`), so the payload field is recoverable
      // with a localized cast. Localized to this file so the SFC
      // doesn't need its own ECharts-shape assertions.
      type ParamWithData = { data?: { payload?: P }; event?: { offsetX: number; offsetY: number } };
      inst.on('click', (params) => {
        const data = (params as ParamWithData).data;
        if (data?.payload !== undefined) cfg.onClick(data.payload);
      });
      inst.on('mouseover', (params) => {
        const p = params as ParamWithData;
        if (p.data?.payload === undefined || !p.event) return;
        cfg.onHover(p.data.payload, p.event.offsetX, p.event.offsetY);
      });
      inst.on('mouseout', () => cfg.onLeave());

      const obs = new ResizeObserver(() => inst?.resize());
      obs.observe(cfg.el);
      observers.set(cfg.treeKey, obs);
    }
    return inst;
  }

  function render(cfg: ForestChartConfig<P>): void {
    const inst = ensure(cfg);
    if (!inst) {
      // Container not yet sized — try again on next tick. Mirrors
      // LineageTreeChart's initial-mount race-window pattern.
      // magic-literal: 50ms render-retry — short enough to feel
      // immediate after layout settles, long enough that the next tick
      // has actually happened. Empirically tuned.
      setTimeout(() => render(cfg), 50);
      return;
    }
    const isMassive = cfg.renderedNodeCount > 500;
    inst.setOption({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        triggerOn: 'mousemove',
        backgroundColor: themeColor('--surface-0'),
        borderColor: themeColor('--accent-primary'),
        textStyle: { color: themeColor('--text-1'), fontSize: 11 },
        enterable: true,
        // Keep the tooltip inside the chart's bounding rect — without
        // this, ECharts positions the tooltip outside the chart when
        // hovering near an edge, and the chart's ancestor
        // `.forest-container { overflow: hidden }` then clips it. The
        // visible symptom was "tooltip falls under the adjacent pane"
        // at 4K and 1024×768 (1024×768 worse because the chart is
        // narrower; tooltip exits sooner). Same fix as `BaseChart.vue`
        // for the analysis charts; iter-18 backfilled it here.
        confine: true,
        formatter: (info: { data?: { payload?: P } }) => {
          const payload = info.data?.payload;
          if (payload === undefined) return '';
          return cfg.tooltipFor(payload);
        },
      },
      series: [
        {
          type: 'tree',
          data: [cfg.data],
          top: '5%',
          left: '10%',
          bottom: '5%',
          right: '15%',
          layout: 'orthogonal',
          orient: cfg.orient,
          symbolSize: 8,
          initialTreeDepth: -1,
          roam: true,
          // Disable ECharts' built-in collapse so click is purely
          // a navigation/expansion signal we own.
          expandAndCollapse: false,
          label: {
            show: !isMassive,
            position: cfg.orient === 'TB' ? 'top' : 'left',
            fontSize: 9,
            color: themeColor('--text-1'),
          },
          leaves: {
            label: {
              show: !isMassive,
              position: cfg.orient === 'TB' ? 'bottom' : 'right',
            },
          },
          animationDuration: isMassive ? 0 : 400,
          animationDurationUpdate: isMassive ? 0 : 400,
          lineStyle: { color: themeColor('--border-3'), curveness: 0.4, width: 1.2 },
        },
      ],
    });
  }

  // Last-applied configs, retained so the theme-change watcher below
  // can rebuild the active chart set without involving the caller.
  // Cleared by sync's destroy pass when a config drops out.
  let lastConfigs: ForestChartConfig<P>[] = [];

  function syncCharts(configs: ForestChartConfig<P>[]): void {
    const liveKeys = new Set(configs.map(c => c.treeKey));
    for (const k of [...instances.keys()]) {
      if (!liveKeys.has(k)) destroy(k);
    }
    for (const cfg of configs) render(cfg);
    lastConfigs = configs;
  }

  // Theme change → re-issue setOption on every active instance with
  // freshly-resolved theme colors. The chart instances themselves are
  // preserved (no init/dispose churn); render() walks each config and
  // hits its existing instance via ensure()'s "already exists" path.
  // Without this watcher, themeColor() values would be frozen at the
  // first-render time; switching app theme would leave the chart
  // pinned to the prior theme's colors until the next data-change
  // re-render.
  const stopThemeWatch = watch(
    () => store.profile.settings.appearance.theme,
    () => { for (const cfg of lastConfigs) render(cfg); },
  );

  onUnmounted(() => {
    stopThemeWatch();
    for (const k of [...instances.keys()]) destroy(k);
  });

  return { syncCharts };
}
