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
import { themeColor } from '../../utils/theme-color';
import { store } from '../../store';
import { FOREST_RENDER_RETRY_MS } from '../../lib/timing';
/**
 * Imperative chart-lifecycle owner. The composable disposes
 * everything on unmount; the caller drives `syncCharts` from a
 * watch they own.
 */
export function useEChartsForestRender() {
    const instances = new Map();
    const observers = new Map();
    function destroy(key) {
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
    function ensure(cfg) {
        if (cfg.el.clientWidth < 10 || cfg.el.clientHeight < 10)
            return null;
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
            inst.on('click', (params) => {
                const data = params.data; // narrow ECharts' loose callback param to the datum shape we passed in (see comment above)
                if (data?.payload !== undefined)
                    cfg.onClick(data.payload);
            });
            inst.on('mouseover', (params) => {
                const p = params; // narrow ECharts' loose callback param to the datum shape we passed in (see comment above)
                if (p.data?.payload === undefined || !p.event)
                    return;
                cfg.onHover(p.data.payload, p.event.offsetX, p.event.offsetY);
            });
            inst.on('mouseout', () => cfg.onLeave());
            const obs = new ResizeObserver(() => inst?.resize());
            obs.observe(cfg.el);
            observers.set(cfg.treeKey, obs);
        }
        return inst;
    }
    function render(cfg) {
        const inst = ensure(cfg);
        if (!inst) {
            // Container not yet sized — try again on next tick. Mirrors
            // LineageTreeChart's initial-mount race-window pattern.
            // Render-retry — short enough to feel immediate after layout
            // settles, long enough that the next tick has actually happened.
            // The forest render-retry constant from the timing catalog
            // (`lib/timing`).
            setTimeout(() => render(cfg), FOREST_RENDER_RETRY_MS);
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
                formatter: (info) => {
                    const payload = info.data?.payload;
                    if (payload === undefined)
                        return '';
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
    let lastConfigs = [];
    function syncCharts(configs) {
        const liveKeys = new Set(configs.map(c => c.treeKey));
        for (const k of [...instances.keys()]) {
            if (!liveKeys.has(k))
                destroy(k);
        }
        for (const cfg of configs)
            render(cfg);
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
    const stopThemeWatch = watch(() => store.profile.settings.appearance.theme, () => { for (const cfg of lastConfigs)
        render(cfg); });
    onUnmounted(() => {
        stopThemeWatch();
        for (const k of [...instances.keys()])
            destroy(k);
    });
    return { syncCharts };
}
