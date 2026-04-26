<!-- 
  src/components/SystemLogPanel.vue
  Always-visible system log bar. Renders messages pushed via
  pushSystemMessage() in the store, plus an idle row when the queue
  is empty so the bar is present as a stable UI surface.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed } from 'vue';
import { store, dismissSystemMessage, clearSystemMessages } from '../store';

const hasMessages = computed(() => store.engine.messages.length > 0);
</script>

<template>
  <div class="system-log-panel">
    <div class="panel-header">
      <span class="title">System Diagnostics</span>
      <button
        class="clear-btn"
        :disabled="!hasMessages"
        @click="clearSystemMessages"
      >Clear All</button>
    </div>
    
    <div v-if="hasMessages" class="messages-list">
      <div 
        v-for="msg in store.engine.messages" 
        :key="msg.id"
        class="message-row"
        :class="`msg-${msg.type}`"
      >
        <span class="msg-icon">{{ msg.type === 'error' ? '❌' : (msg.type === 'warning' ? '⚠️' : 'ℹ️') }}</span>
        <div class="msg-content">
          <span class="msg-time">{{ new Date(msg.timestamp).toLocaleTimeString() }}</span>
          <span class="msg-text">{{ msg.text }}</span>
        </div>
        <button class="dismiss-btn" @click="dismissSystemMessage(msg.id)">×</button>
      </div>
    </div>

    <!-- Empty state: keeps the bar present with a stable height so
         the surface doesn't pop in/out as messages arrive and clear. -->
    <div v-else class="empty-state">
      <span class="empty-dot">·</span>
      <span class="empty-text">No messages.</span>
    </div>
  </div>
</template>

<style scoped>
.system-log-panel {
  background: #111;
  border-bottom: 1px solid #333;
  display: flex;
  flex-direction: column;
  max-height: 250px;
  flex-shrink: 0;
  box-shadow: inset 0 -5px 10px rgba(0,0,0,0.5);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 12px;
  background: #181818;
  border-bottom: 1px solid #222;
}

.title {
  font-size: 10px;
  text-transform: uppercase;
  color: #888;
  letter-spacing: 0.1em;
  font-weight: bold;
}

.clear-btn {
  background: none;
  border: none;
  color: #4aaef0;
  font-size: 10px;
  cursor: pointer;
  text-transform: uppercase;
}
.clear-btn:hover:not(:disabled) { color: #fff; }
.clear-btn:disabled { color: #333; cursor: default; }

.messages-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.message-row {
  display: flex;
  align-items: flex-start;
  padding: 8px 10px;
  background: #1a1a1a;
  border-left: 3px solid #555;
  border-radius: 2px;
  gap: 10px;
}

.msg-error { border-left-color: #ff4a4a; background: rgba(255, 74, 74, 0.05); }
.msg-warning { border-left-color: #f0a04a; background: rgba(240, 160, 74, 0.05); }
.msg-info { border-left-color: #4aaef0; }

.msg-icon { font-size: 14px; margin-top: 2px; }

.msg-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.msg-time {
  font-size: 9px;
  color: #666;
  font-family: monospace;
}

.msg-text {
  font-size: 11px;
  color: #eee;
  font-family: monospace;
  white-space: pre-wrap; /* Preserve stack traces if sent by Python */
  line-height: 1.4;
}

.dismiss-btn {
  background: none;
  border: none;
  color: #666;
  font-size: 16px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}
.dismiss-btn:hover { color: #fff; }

.empty-state {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  font-family: monospace;
}
.empty-dot { color: #333; font-size: 14px; line-height: 1; }
.empty-text { color: #444; font-size: 11px; font-style: italic; }
</style>
