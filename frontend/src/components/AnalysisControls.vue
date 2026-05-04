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

      <div style="display: flex; gap: var(--space-default);">
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
.tab-padding { padding: 0; }
.header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-default); }
h3 { margin-top: 0; font-size: var(--text-emphasis); color: var(--accent-primary); }
.status-indicator { font-weight: bold; color: var(--text-0); }
.status-indicator.connected { color: var(--state-success); }

.palette-selector { display: flex; align-items: center; gap: var(--space-default); font-size: var(--text-body); color: var(--text-1); text-transform: uppercase; }
.dark-select { background: var(--surface-1); border: 1px solid var(--border-2); color: var(--accent-primary); padding: 2px 6px; border-radius: var(--radius-default); font-size: var(--text-body); outline: none; cursor: pointer; text-transform: uppercase; }

/* theme-exception: .warning-btn uses muted-state-error variants
   (#5a1a1a border, #3a1a1a hover bg) — same pattern as
   PaletteEditor's .del-btn. */
.warning-btn { color: var(--state-error) !important; border-color: #5a1a1a !important; }
.warning-btn:hover { background: #3a1a1a !important; }

.toolbar-btn-sm { background: var(--border-1); border: 1px solid var(--border-3); color: var(--text-1); padding: 2px 6px; font-size: var(--text-body); cursor: pointer; border-radius: var(--radius-default); text-transform: uppercase; }

/* ... remaining styles ... */
.analysis-config-box { margin-top: 0; background: var(--surface-2); padding: 0 var(--space-medium); border-radius: var(--radius-default); border: 1px solid var(--surface-3); }
.move-filter-box { border-bottom: 2px solid var(--border-2); margin-bottom: var(--space-medium); }
.settings-row { display: flex; flex-direction: column; gap: 3px; }
.label-with-value { display: flex; justify-content: space-between; align-items: center; font-size: var(--text-body); color: var(--text-1); }
.value-badge { background: var(--border-2); padding: 0 var(--space-default); border-radius: var(--radius-default); color: var(--accent-primary); font-family: monospace; }
.range-slider { width: 100%; accent-color: var(--accent-primary); cursor: pointer; }
.hint { font-size: var(--text-body); color: var(--text-0); margin: 0; }
.chart-container-outer { margin-top: 0; min-height: 200px; }
</style>

