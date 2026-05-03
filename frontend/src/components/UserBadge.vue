<script setup lang="ts">
/**
 * src/components/UserBadge.vue
 *
 * Displays current authentication identity AND opens the LoginModal on
 * click. Pattern-matches the AuthState discriminated union into a flat
 * presentational record (BadgeView) in script; template stays dumb.
 *
 * Future evolution: in B5 the 'authenticated' label can use the
 * JWT-verified username from /auth/me. Touches only this file.
 *
 * License: Public Domain (The Unlicense)
 */

import { ref, computed, watch } from 'vue';
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
      // Pre-bootstrap; render a non-breaking space to reserve layout
      // height without a visible flash before tryAutoLogin completes.
      return { kind: s.kind, label: '\u00A0',              dotClass: 'dot-idle' };
  }
});

// Modal visibility — ephemeral local state owned by this component.
// Not in any store; the LoginModal is mounted only when open, so its
// own form state is also fresh on every open.
const isModalOpen = ref(false);
function openModal(): void  { isModalOpen.value = true;  }
function closeModal(): void { isModalOpen.value = false; }

// Auto-open the modal when auth transitions to a state where login
// is the natural next action — rejection (state goes to
// 'unauthenticated' from 'authenticated' due to /auth/me 401) and
// verify errors ('error'). Without this, the user has to discover
// the badge-click affordance after their session was invalidated.
//
// No `immediate: true`: the initial 'unknown' state during boot is
// skipped, so the modal stays closed until the auth subsystem
// actually settles into a non-authenticated state. Consequently
// cold-start with auto-fill (state goes unknown → authenticating →
// authenticated) does not flash the modal.
watch(
  () => state.value.kind,
  (next) => {
    if (next === 'unauthenticated' || next === 'error') {
      isModalOpen.value = true;
    }
  },
);
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
  display: inline-flex; align-items: center; gap: var(--space-default);
  padding: 0 var(--space-default) 0 var(--space-medium); margin-left: var(--space-tight); height: 100%;
  font-size: var(--text-emphasis); color: var(--text-1); font-family: inherit;
  background: none; border: none; border-left: 1px solid var(--border-1);
  cursor: pointer; user-select: none; outline: none;
}
.user-badge:hover { background: color-mix(in srgb, var(--accent-primary) 8%, transparent); }
.user-badge:focus-visible { outline: 1px solid var(--accent-primary); outline-offset: -1px; }

.dot {
  display: inline-block; width: 7px; height: 7px;
  border-radius: 50%; background: var(--border-3); flex-shrink: 0;
}

/* dot color matches turn-indicator palette */
.dot-ok      { background: var(--accent-primary); }
.dot-pending { background: var(--state-warning); }
.dot-err     { background: var(--state-attention); }
.dot-idle    { background: var(--border-3); }

.label { font-family: monospace; font-size: var(--text-body); }

.auth-authenticated  .label { color: var(--text-0); }
.auth-authenticating .label { color: var(--state-warning); }
.auth-error          .label { color: var(--state-attention); }
</style>
