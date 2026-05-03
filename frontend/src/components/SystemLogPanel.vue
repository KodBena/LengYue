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
  background: var(--surface-1);
  border-bottom: 1px solid var(--border-2);
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
  padding: var(--space-tight) var(--space-medium);
  background: var(--surface-2);
  border-bottom: 1px solid var(--surface-3);
}

.title {
  font-size: var(--text-body);
  text-transform: uppercase;
  color: var(--text-2);
  letter-spacing: 0.1em;
  font-weight: bold;
}

.clear-btn {
  background: none;
  border: none;
  color: var(--accent-primary);
  font-size: var(--text-body);
  cursor: pointer;
  text-transform: uppercase;
}
.clear-btn:hover:not(:disabled) { color: var(--text-0); }
.clear-btn:disabled { color: var(--border-2); cursor: default; }

.messages-list {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-default);
  display: flex;
  flex-direction: column;
  gap: var(--space-tight);
}

.message-row {
  display: flex;
  align-items: flex-start;
  padding: var(--space-default) var(--space-medium);
  background: var(--surface-2);
  border-left: 3px solid var(--border-3);
  border-radius: 2px;
  gap: var(--space-medium);
}

.msg-error { border-left-color: var(--state-attention); background: color-mix(in srgb, var(--state-attention) 5%, transparent); }
.msg-warning { border-left-color: var(--state-warning); background: color-mix(in srgb, var(--state-warning) 5%, transparent); }
.msg-info { border-left-color: var(--accent-primary); }

.msg-icon { font-size: var(--text-heading); margin-top: 2px; }

.msg-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.msg-time {
  font-size: var(--text-tiny);
  color: var(--text-2);
  font-family: monospace;
}

.msg-text {
  font-size: var(--text-emphasis);
  color: var(--text-0);
  font-family: monospace;
  white-space: pre-wrap; /* Preserve stack traces if sent by Python */
  line-height: 1.4;
}

.dismiss-btn {
  background: none;
  border: none;
  color: var(--text-2);
  font-size: var(--text-heading);
  cursor: pointer;
  padding: 0;
  line-height: 1;
}
.dismiss-btn:hover { color: var(--text-0); }

.empty-state {
  display: flex;
  align-items: center;
  gap: var(--space-default);
  padding: var(--space-default) var(--space-medium);
  font-family: monospace;
}
.empty-dot { color: var(--border-2); font-size: var(--text-heading); line-height: 1; }
.empty-text { color: var(--border-3); font-size: var(--text-emphasis); font-style: italic; }
</style>
