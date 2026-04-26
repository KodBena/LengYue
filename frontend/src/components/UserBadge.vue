<!--
  src/components/UserBadge.vue
  Displays current authentication identity. Pure presentational leaf;
  reads `useAuth().state` directly and pattern-matches the discriminated
  union into a flat presentational record (BadgeView).

  Future evolution: in B3 this becomes a button that opens LoginModal;
  in B5 the 'authenticated' label can use the JWT-verified username
  from /auth/me. Both extensions touch only this file.

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useAuth } from '../composables/useAuth';
import type { AuthState } from '../types';

const { state } = useAuth();

// Pure projection of AuthState into a presentational record. Exhaustive
// pattern match — TypeScript will flag a missing case if `AuthState`
// gains a new constructor, which is how this stays honest as the
// auth subsystem grows.
interface BadgeView {
  readonly kind: AuthState['kind'];
  readonly label: string;
  readonly dotClass: 'dot-ok' | 'dot-pending' | 'dot-idle' | 'dot-err';
}

const view = computed<BadgeView>(() => {
  const s = state.value;
  switch (s.kind) {
    case 'authenticated':
      return { kind: s.kind, label: s.username,           dotClass: 'dot-ok' };
    case 'authenticating':
      return { kind: s.kind, label: 'signing in…',         dotClass: 'dot-pending' };
    case 'unauthenticated':
      return { kind: s.kind, label: 'no account',          dotClass: 'dot-idle' };
    case 'error':
      return { kind: s.kind, label: 'sign-in failed',      dotClass: 'dot-err' };
    case 'unknown':
      // Pre-bootstrap; render a non-breaking space to reserve layout
      // height without a visible flash before tryAutoLogin completes.
      return { kind: s.kind, label: '\u00A0',              dotClass: 'dot-idle' };
  }
});
</script>

<template>
  <span
    class="user-badge"
    :class="`auth-${view.kind}`"
    :title="`Auth state: ${view.kind}`"
  >
    <span class="dot" :class="view.dotClass"></span>
    <span class="label">{{ view.label }}</span>
  </span>
</template>

<style scoped>
.user-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 0 0 12px;
  margin-left: 4px;
  font-size: 11px;
  color: #aaa;
  border-left: 1px solid #2a2a2a;
  user-select: none;
}

.dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #555;
  flex-shrink: 0;
}

.dot-ok      { background: #4aaef0; } /* matches turn-indicator.B */
.dot-pending { background: #f0a04a; } /* matches turn-indicator.W */
.dot-err     { background: #ff4a4a; } /* matches the SR review-fail red */
.dot-idle    { background: #555; }

.label {
  font-family: monospace;
  font-size: 10px;
}

.auth-authenticated  .label { color: #ddd; }
.auth-authenticating .label { color: #f0a04a; }
.auth-error          .label { color: #ff4a4a; }
</style>
