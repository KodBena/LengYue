<!-- 
  src/components/chrome/SystemLogPanel.vue
  System log panel. Renders messages pushed via pushSystemMessage() in
  the store, plus an idle row when the queue is empty so the panel is
  present as a stable UI surface whenever it's shown. Mounted in
  App.vue's `#lyt-overlay-stack` (W4 item 1) when
  `session.ui.systemLogExpanded` (manual toggle, `SystemLogToggle.vue`
  — D2 fix) OR the transient auto-reveal (`useTransientLogReveal.ts`)
  is true — no longer unconditionally visible, corrected from this
  header's own stale "always-visible" claim (D2 fix).
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed } from 'vue';
import { store, dismissSystemMessage, clearSystemMessages } from '../../store';

const hasMessages = computed(() => store.engine.messages.length > 0);
</script>

<template>
  <div class="system-log-panel">
    <div class="panel-header">
      <span class="title">{{ $t('systemLog.title') }}</span>
      <button
        class="clear-btn"
        :disabled="!hasMessages"
        @click="clearSystemMessages"
      >{{ $t('systemLog.clearAll') }}</button>
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
          <!-- Dispatch L3 repair (ADR-0019 C8): `remediation`/`nextAction`
               are structured fields on `SystemMessage`, not flattened into
               `msg.text` — rendered as their own subordinate lines when a
               producer supplies them. `nextAction` is a LABEL only: no
               affordance named `open-default-layout-control` exists on
               this branch to wire a click handler to (disclosed gap, not
               a silently-implied control). -->
          <span v-if="msg.remediation" class="msg-remediation">{{ msg.remediation }}</span>
          <span v-if="msg.nextAction" class="msg-next-action">{{ $t('systemLog.nextAction') }}: {{ msg.nextAction }}</span>
        </div>
        <button class="dismiss-btn" @click="dismissSystemMessage(msg.id)">×</button>
      </div>
    </div>

    <!-- Empty state: keeps the bar present with a stable height so
         the surface doesn't pop in/out as messages arrive and clear. -->
    <div v-else class="empty-state">
      <span class="empty-dot">·</span>
      <span class="empty-text">{{ $t('systemLog.noMessages') }}</span>
    </div>
  </div>
</template>

<style scoped>
/* W4 item 1: this panel now mounts inside App.vue's `#lyt-overlay-stack`
   (a `position: fixed` overlay, never an in-flow chrome bar) — see that
   element's own CSS comment for the full placement/non-occlusion
   derivation. Restyled from an in-flow bar (border-bottom only,
   flush against its neighbours) to a floating card (full border +
   radius, opaque `--surface-0` fill unchanged — the standing
   "no scrim/translucency" ruling this panel already followed). No
   box-shadow (the effects-ban sweep, ledger row 1506, bans it outright,
   no carve-outs) — the border alone reads as "a distinct floating
   surface" against whatever chrome happens to be underneath. */
.system-log-panel {
  background: var(--surface-0);
  border: 1px solid var(--border-2);
  border-radius: var(--radius-default);
  display: flex;
  flex-direction: column;
  max-height: 250px;
  flex-shrink: 0;
  overflow: hidden;
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
  color: var(--text-0);
  letter-spacing: var(--tracking-default);
  font-weight: bold;
}

.clear-btn {
  background: none;
  border: none;
  /* wC-contrast (F9 named site — the "CLEAR ALL" control): readable
     text is --text-0, not accent-primary — 2.08:1 in the default
     cluster theme. */
  color: var(--text-0);
  font-size: var(--text-body);
  cursor: pointer;
  text-transform: uppercase;
}
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
  border-radius: var(--radius-default);
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
  color: var(--text-0);
  font-family: monospace;
}

.msg-text {
  font-size: var(--text-emphasis);
  color: var(--text-0);
  font-family: monospace;
  white-space: pre-wrap; /* Preserve stack traces if sent by Python */
  line-height: 1.4;
}

.msg-remediation,
.msg-next-action {
  font-size: var(--text-body);
  color: var(--text-0);
  font-family: monospace;
  line-height: 1.4;
}

.dismiss-btn {
  background: none;
  border: none;
  color: var(--text-0);
  font-size: var(--text-heading);
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

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
