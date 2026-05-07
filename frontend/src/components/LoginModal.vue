<script setup lang="ts">
/**
 * src/components/LoginModal.vue
 *
 * Sign-in / register / switch-user / sign-out modal.
 *
 * Owns its own form state. Reads `useAuth().state` for context display
 * and to detect in-flight / error transitions. Submits via a single
 * parameterised `submit(action)` that dispatches to login or register
 * by pattern match. Logout is a separate synchronous action surfaced
 * only when the current state is 'authenticated'.
 *
 * License: Public Domain (The Unlicense)
 */

import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuth } from '../composables/useAuth';

const { t } = useI18n();
const { state, login, register, logout } = useAuth();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

// ─── Form state (local; not in any store) ───────────────────────────────────

const username = ref('');
const usePassword = ref(false);
const password = ref('');

// ─── Derived view ───────────────────────────────────────────────────────────

const inFlight = computed(() => state.value.kind === 'authenticating');
const isAuthenticated = computed(() => state.value.kind === 'authenticated');

const errorMessage = computed((): string | null =>
  state.value.kind === 'error' ? state.value.message : null
);

const currentIdentity = computed((): string => {
  switch (state.value.kind) {
    case 'authenticated':   return t('auth.currentIdentity.authenticated', { username: state.value.username });
    case 'unauthenticated': return t('auth.currentIdentity.unauthenticated');
    case 'authenticating':  return t('auth.currentIdentity.authenticating');
    case 'error':           return t('auth.currentIdentity.error');
    case 'unknown':         return '';
  }
});

const canSubmit = computed(() =>
  !inFlight.value && username.value.trim().length > 0
);

// ─── Submit (parameterised over action) ─────────────────────────────────────

type SubmitAction = 'login' | 'register';

async function submit(action: SubmitAction): Promise<void> {
  if (!canSubmit.value) return;
  const op = action === 'login' ? login : register;
  const pw = usePassword.value ? password.value : undefined;
  try {
    await op(username.value.trim(), pw);
    emit('close');
  } catch {
    // Error already reflected on `state.kind === 'error'` and surfaced
    // via the system log by the composable. Modal stays open so the
    // user can read the error and retry.
  }
}

// ─── Sign-out (synchronous, no try/catch needed — the action can't fail) ────

function handleSignOut(): void {
  logout();
  emit('close');
}

// ─── Dismiss handlers ───────────────────────────────────────────────────────

function handleCancel(): void {
  emit('close');
}

function handleBackdropClick(e: MouseEvent): void {
  // Close only when the click was on the backdrop itself, not bubbled
  // up from the modal card.
  if (e.target === e.currentTarget) emit('close');
}
</script>

<template>
  <div class="modal-backdrop" @click="handleBackdropClick">
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="login-modal-title">
      <h3 id="login-modal-title" class="modal-title">{{ $t('auth.title') }}</h3>

      <p class="current-identity" v-if="currentIdentity">{{ currentIdentity }}</p>

      <div class="form-row">
        <label for="login-username">{{ $t('auth.field.username') }}</label>
        <input
          id="login-username"
          v-model="username"
          type="text"
          class="text-input"
          autocomplete="username"
          autofocus
          @keyup.enter="submit('login')"
        />
      </div>

      <div class="form-row checkbox-row">
        <input id="login-use-password" v-model="usePassword" type="checkbox" />
        <label for="login-use-password">{{ $t('auth.field.usePasswordLabel') }}</label>
      </div>

      <div class="form-row" v-if="usePassword">
        <label for="login-password">{{ $t('auth.field.password') }}</label>
        <input
          id="login-password"
          v-model="password"
          type="password"
          class="text-input"
          autocomplete="current-password"
          @keyup.enter="submit('login')"
        />
      </div>

      <p class="error-message" v-if="errorMessage">{{ errorMessage }}</p>

      <div class="button-row">
        <button class="btn btn-secondary" @click="handleCancel" :disabled="inFlight">
          {{ $t('auth.button.cancel') }}
        </button>
        <button v-if="isAuthenticated" class="btn btn-danger" @click="handleSignOut" :disabled="inFlight">
          {{ $t('auth.button.signOut') }}
        </button>
        <button class="btn btn-secondary" @click="submit('register')" :disabled="!canSubmit">
          {{ $t('auth.button.registerAndSignIn') }}
        </button>
        <button class="btn btn-primary" @click="submit('login')" :disabled="!canSubmit">
          {{ inFlight ? $t('auth.button.signingIn') : $t('auth.button.signIn') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed; inset: 0; z-index: var(--z-modal);
  background: rgba(0, 0, 0, 0.6);
  display: flex; align-items: center; justify-content: center;
}

/* magic-literal: 360px LoginModal width — narrower than the 420px
   ConfirmLoadModal/MintCardModal pattern because the auth form has
   fewer / shorter fields. 3 modal sites total at 2 widths; modal-
   width substrate not pursued (thin cluster). */
.modal-card {
  background: var(--surface-2); border: 1px solid var(--border-2); border-radius: var(--radius-default);
  padding: var(--space-loose); width: 360px; max-width: 90vw;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
  display: flex; flex-direction: column; gap: var(--space-medium);
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

.modal-title { color: var(--text-0); margin: 0; font-size: var(--text-heading); }
.current-identity { color: var(--text-2); font-size: var(--text-emphasis); margin: 0 0 var(--space-tight) 0; font-family: monospace; }

.form-row { display: flex; flex-direction: column; gap: var(--space-tight); }
.form-row label { color: var(--text-2); font-size: var(--text-emphasis); text-transform: uppercase; }

.form-row.checkbox-row { flex-direction: row; align-items: center; gap: var(--space-default); }
.form-row.checkbox-row label { text-transform: none; font-size: var(--text-emphasis); color: var(--text-1); }

.text-input {
  background: var(--surface-0); border: 1px solid var(--border-2); color: var(--text-0);
  padding: var(--space-default) var(--space-default); font-size: var(--text-emphasis); font-family: inherit;
  border-radius: var(--radius-default); outline: none;
}
.text-input:focus { border-color: var(--accent-primary); }

.error-message { color: var(--state-attention); font-size: var(--text-emphasis); margin: 0; word-break: break-word; }

.button-row { display: flex; justify-content: flex-end; gap: var(--space-default); margin-top: var(--space-default); flex-wrap: wrap; }

.btn {
  padding: var(--space-default) var(--space-medium); font-size: var(--text-emphasis); font-family: inherit;
  border: 1px solid transparent; border-radius: var(--radius-default); cursor: pointer;
}
.btn:disabled { cursor: not-allowed; opacity: var(--alpha-disabled); }

.btn-secondary { background: var(--border-2); border-color: var(--border-3); color: var(--text-1); }

.btn-primary { background: var(--accent-primary); border-color: var(--accent-primary); color: var(--text-0); font-weight: bold; }

/* theme-exception: .btn-danger uses muted-attention surface variants
   (#4a2020 / #6a3030) and pinkish-pale text (#ffaaaa) — designer-
   intentional muted destructive-button aesthetic. Same substrate gap
   as PaletteEditor's .del-btn (no tinted-state anchors yet). Hover-
   state literals retired with the no-mouseover-change sweep. */
.btn-danger { background: #4a2020; border-color: #6a3030; color: #ffaaaa; }
</style>
