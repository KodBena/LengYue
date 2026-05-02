<script setup lang="ts">
import { computed } from 'vue';
import type { BoardId } from '../types';
import { store } from '../store';
import { ledger } from '../services/analysis-ledger';
import { analysisService } from '../services/analysis-service';
import AnalysisDashboard from './charts/AnalysisDashboard.vue';

const props = defineProps<{ boardId: BoardId; }>();
const palettes = computed(() => store.profile.settings.engine.katago.analysis_env.palettes);

function purgeLedger() {
  if (confirm("Clear all analysis data for this board across all palettes?")) {
    analysisService.stopBoardAnalysis(props.boardId);
    ledger.purgeBoard(props.boardId);
  }
}
</script>

<template>
  <div class="tab-padding">
    <div class="header-row">
      <p>
        Engine: 
        <span class="status-indicator" :class="{ 'connected': store.engine.status === 'connected' }">
          {{ store.engine.status === 'connected' ? 'Connected' : 'Offline' }}
        </span>
      </p>

      <div style="display: flex; gap: 8px;">
        <div class="palette-selector">
          <label>Palette:</label>
          <select v-model="store.profile.settings.engine.katago.analysis_env.activePaletteId" class="dark-select">
            <option v-for="p in palettes" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </div>
        <button class="toolbar-btn-sm warning-btn" @click="purgeLedger" title="Purge Cache">Purge</button>
      </div>
    </div>
    
    <!-- ... same as before ... -->
    <div class="analysis-config-box move-filter-box">
      <div class="settings-row">
        <label class="label-with-value">
          <span>Move Filter</span>
          <span class="value-badge">{{ (store.session.ui.moveFilterThreshold * 100).toFixed(0) }}%</span>
        </label>
        <input 
          type="range" 
          min="0" 
          max="1" 
          step="0.01" 
          v-model.number="store.session.ui.moveFilterThreshold" 
          class="range-slider"
        />
        <p class="hint">Threshold: {{ store.session.ui.moveFilterThreshold }}</p>
      </div>
    </div>

    <div class="chart-container-outer">
      <AnalysisDashboard 
        :key="boardId"
        :boardId="boardId"
      />
    </div>
  </div>
</template>

<style scoped>
.tab-padding { padding: 0px; }
.header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
h3 { margin-top: 0; font-size: 12px; color: var(--accent-primary); }
.status-indicator { font-weight: bold; color: var(--text-0); }
.status-indicator.connected { color: var(--state-success); }

.palette-selector { display: flex; align-items: center; gap: 8px; font-size: 10px; color: var(--text-1); text-transform: uppercase; }
.dark-select { background: var(--surface-1); border: 1px solid var(--border-2); color: var(--accent-primary); padding: 2px 6px; border-radius: 3px; font-size: 10px; outline: none; cursor: pointer; text-transform: uppercase; }

/* theme-exception: .warning-btn uses muted-state-error variants
   (#5a1a1a border, #3a1a1a hover bg) — same pattern as
   PaletteEditor's .del-btn. */
.warning-btn { color: var(--state-error) !important; border-color: #5a1a1a !important; }
.warning-btn:hover { background: #3a1a1a !important; }

.toolbar-btn-sm { background: var(--border-2); border: 1px solid var(--border-3); color: var(--text-1); padding: 2px 6px; font-size: 10px; cursor: pointer; border-radius: 3px; text-transform: uppercase; }

/* ... remaining styles ... */
.analysis-config-box { margin-top: 0px; background: var(--surface-2); padding: 0px 12px; border-radius: 4px; border: 1px solid var(--surface-3); }
.move-filter-box { border-bottom: 2px solid var(--border-2); margin-bottom: 15px; }
.settings-row { display: flex; flex-direction: column; gap: 3px; }
.label-with-value { display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: var(--text-1); }
.value-badge { background: var(--border-2); padding: 0px 6px; border-radius: 4px; color: var(--accent-primary); font-family: monospace; }
.range-slider { width: 100%; accent-color: var(--accent-primary); cursor: pointer; }
.hint { font-size: 10px; color: var(--text-0); margin: 0; }
.chart-container-outer { margin-top: 0px; min-height: 200px; }
</style>

