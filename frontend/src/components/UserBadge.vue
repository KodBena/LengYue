<!--
  src/components/UserBadge.vue
  Displays current authentication identity AND opens the LoginModal on
  click. Pattern-matches the AuthState discriminated union into a flat
  presentational record (BadgeView) in script; template stays dumb.

  Future evolution: in B5 the 'authenticated' label can use the
  JWT-verified username from /auth/me. Touches only this file.

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAuth } from '../composables/useAuth';
import LoginModal from './LoginModal.vue';
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
      return { kind: s.kind, label: '\u00A0',              dotClass: 'dot-idle' };
  }
});

// Modal visibility — ephemeral local state owned by this component.
// Not in any store; the LoginModal is mounted only when open, so its
// own form state is also fresh on every open.
const isModalOpen = ref(false);
function openModal(): void  { isModalOpen.value = true;  }
function closeModal(): void { isModalOpen.value = false; }
</script>

<template>
  <button
    type="button"
    class="user-badge"
    :class="`auth-${view.kind}`"
    :title="`Auth: ${view.kind} — click to sign in or switch user`"
    @click="openModal"
  >
    <span class="dot" :class="view.dotClass"></span>
    <span class="label">{{ view.label }}</span>
  </button>

  <LoginModal v-if="isModalOpen" @close="closeModal" />
</template>

<style scoped>
.user-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px 0 12px;
  margin-left: 4px;
  height: 100%;
  font-size: 11px;
  color: #aaa;
  background: none;
  border: none;
  border-left: 1px solid #2a2a2a;
  cursor: pointer;
  user-select: none;
  font-family: inherit;
  outline: none;
}
.user-badge:hover {
  background: rgba(74, 174, 240, 0.08);
}
.user-badge:focus-visible {
  outline: 1px solid #4aaef0;
  outline-offset: -1px;
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
