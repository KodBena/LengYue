/**
 * src/composables/useEChartsForestRender.ts
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

import { onUnmounted } from 'vue';
import * as echarts from 'echarts';
import type { EChartsTreeNode } from '../components/charts/card-tree-echarts';
import { themeColor } from '../utils/theme-color';

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
      inst = echarts.init(cfg.el, 'dark', { renderer: 'svg' });
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
      setTimeout(() => render(cfg), 50);
      return;
    }
    const isMassive = cfg.renderedNodeCount > 500;
    inst.setOption({
      tooltip: {
        trigger: 'item',
        triggerOn: 'mousemove',
        backgroundColor: themeColor('--surface-1'),
        borderColor: themeColor('--accent-primary'),
        textStyle: { color: themeColor('--text-1'), fontSize: 11 },
        enterable: true,
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

  function syncCharts(configs: ForestChartConfig<P>[]): void {
    const liveKeys = new Set(configs.map(c => c.treeKey));
    for (const k of [...instances.keys()]) {
      if (!liveKeys.has(k)) destroy(k);
    }
    for (const cfg of configs) render(cfg);
  }

  onUnmounted(() => {
    for (const k of [...instances.keys()]) destroy(k);
  });

  return { syncCharts };
}
