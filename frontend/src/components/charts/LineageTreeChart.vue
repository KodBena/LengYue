<!-- 
  src/components/charts/LineageTreeChart.vue 
-->
<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import * as echarts from 'echarts';
import type { ReviewCard } from '../../types';
import { getCardThumbnailSync } from '../../composables/useCardThumbnail';

const props = defineProps<{
  cards: ReviewCard[];
}>();

const emit = defineEmits<{
  (e: 'node-click', card: ReviewCard): void;
}>();

const chartRef = ref<HTMLElement | null>(null);
let chartInstance: echarts.ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;
let initTimeout: number | null = null;

function buildTreeData(cards: ReviewCard[]) {
  if (!cards.length) return {};

  const map = new Map<number, any>();
  const virtualRoot = { name: 'Forest Database', children: [] as any[] };
  
  for (const card of cards) {
    map.set(card.id as unknown as number, {
      name: `Card ${card.id}`,
      value: card.model?.t?.toFixed(2) || '0.00',
      cardData: card,
      children: []
    });
  }

  for (const card of cards) {
    const node = map.get(card.id as unknown as number);
    if (card.parentId && map.has(card.parentId as unknown as number)) {
      map.get(card.parentId as unknown as number).children.push(node);
    } else {
      virtualRoot.children.push(node);
    }
  }

  if (virtualRoot.children.length === 1) return virtualRoot.children[0];
  return virtualRoot; 
}

const updateChart = () => {
  if (!chartInstance) return;
  const treeData = buildTreeData(props.cards);
  const isMassive = props.cards.length > 500;

  chartInstance.clear();

  chartInstance.setOption({
    tooltip: {
      trigger: 'item',
      triggerOn: 'mousemove',
      backgroundColor: '#111',
      borderColor: '#4aaef0',
      textStyle: { color: '#ccc', fontSize: 11 },
      enterable: true,
      formatter: (info: any) => {
        const card: ReviewCard = info.data.cardData;
        if (!card) return `<div style="padding:4px; font-weight:bold; color:#fff;">${info.name}</div>`;

        const svgStr = getCardThumbnailSync(card.id as unknown as number, card.sgf);

        return `
          <div style="display:flex; flex-direction:column; gap:8px;">
            <div style="font-weight:bold; color:#4aaef0; text-transform:uppercase;">
              Card #${card.id}
            </div>
            <div style="width:140px; height:140px; border:1px solid #333; background:#000;">
              ${svgStr}
            </div>
            <div>
              <span style="color:#888">Reviews:</span> ${card.numReviews} <br/>
              <span style="color:#888">Ebisu T:</span> ${card.model?.t?.toFixed(4) || 'N/A'} <br/>
              <span style="color:#888">Visits:</span> ${card.defaultVisits}
            </div>
            <div style="color:#4aaef0; font-size:9px; margin-top:4px;">Click to load position</div>
          </div>
        `;
      }
    },
    series: [
      {
        type: 'tree',
        data: [treeData],
        top: '5%',
        left: '10%',
        bottom: '5%',
        right: '20%',
        symbolSize: isMassive ? 6 : 10,
        initialTreeDepth: 10, // Show everything unless explicitly collapsed
        roam: true, 
        // FIX: Disable ECharts click-to-collapse behaviour so it acts purely as a nav graph
        expandAndCollapse: false, 
        label: {
          show: !isMassive, 
          position: 'top',
          verticalAlign: 'middle',
          align: 'center',
          fontSize: 10,
          color: '#aaa'
        },
        leaves: {
          label: {
            show: !isMassive,
            position: 'right',
            verticalAlign: 'middle',
            align: 'left'
          }
        },
        animationDuration: isMassive ? 0 : 550,
        animationDurationUpdate: isMassive ? 0 : 750,
        itemStyle: {
          color: '#111',          // Unified color so they don't look like toggle buttons
          borderColor: '#4aaef0',
          borderWidth: 1.5
        },
        lineStyle: {
          color: '#444',
          curveness: 0.5,
          width: isMassive ? 1 : 1.5
        }
      }
    ]
  });
};

const initChart = () => {
  if (!chartRef.value) return;
  if (chartRef.value.clientWidth < 10 || chartRef.value.clientHeight < 10) {
    initTimeout = window.setTimeout(initChart, 50);
    return;
  }

  chartInstance = echarts.init(chartRef.value, 'dark', { renderer: 'svg' });
  
  // Wire up Click Event
  chartInstance.on('click', (params: any) => {
    if (params.componentType === 'series' && params.seriesType === 'tree') {
      const card: ReviewCard = params.data.cardData;
      if (card) emit('node-click', card);
    }
  });

  resizeObserver = new ResizeObserver(() => {
    if (!chartRef.value || chartRef.value.clientWidth < 10) return;
    chartInstance?.resize();
  });
  
  resizeObserver.observe(chartRef.value);
  
  if (props.cards.length > 0) {
    updateChart();
  }
};

onMounted(() => {
  initTimeout = window.setTimeout(initChart, 50);
});

watch(() => props.cards, () => {
  if (chartInstance) updateChart();
}, { deep: false });

onUnmounted(() => {
  if (initTimeout) clearTimeout(initTimeout);
  if (resizeObserver && chartRef.value) resizeObserver.unobserve(chartRef.value);
  chartInstance?.dispose();
});
</script>

<template>
  <div ref="chartRef" style="width: 100%; height: 100%; min-height: 400px; background: #000; border: 1px solid #222; border-radius: 4px; cursor: crosshair;"></div>
</template>
