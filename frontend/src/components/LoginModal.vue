<!--
  src/components/LoginModal.vue
  Sign-in / register / switch-user modal.

  Owns its own form state. Reads `useAuth().state` for context display
  and to detect in-flight / error transitions. Submits via a single
  parameterised `submit(action)` that dispatches to login or register
  by pattern match.

  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAuth } from '../composables/useAuth';

const { state, login, register } = useAuth();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

// ─── Form state (local; not in any store) ───────────────────────────────────

const username = ref('');
const usePassword = ref(false);
const password = ref('');

// ─── Derived view ───────────────────────────────────────────────────────────

const inFlight = computed(() => state.value.kind === 'authenticating');

const errorMessage = computed((): string | null =>
  state.value.kind === 'error' ? state.value.message : null
);

const currentIdentity = computed((): string => {
  switch (state.value.kind) {
    case 'authenticated':   return `Currently signed in as ${state.value.username}.`;
    case 'unauthenticated': return 'Not currently signed in.';
    case 'authenticating':  return 'Signing in…';
    case 'error':           return 'Last sign-in attempt failed.';
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
      <h3 id="login-modal-title" class="modal-title">Sign In</h3>

      <p class="current-identity" v-if="currentIdentity">{{ currentIdentity }}</p>

      <div class="form-row">
        <label for="login-username">Username</label>
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
        <input
          id="login-use-password"
          v-model="usePassword"
          type="checkbox"
        />
        <label for="login-use-password">This account uses a password</label>
      </div>

      <div class="form-row" v-if="usePassword">
        <label for="login-password">Password</label>
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
          Cancel
        </button>
        <button class="btn btn-secondary" @click="submit('register')" :disabled="!canSubmit">
          Register &amp; Sign In
        </button>
        <button class="btn btn-primary" @click="submit('login')" :disabled="!canSubmit">
          {{ inFlight ? 'Signing in…' : 'Sign In' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-card {
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 6px;
  padding: 24px;
  width: 360px;
  max-width: 90vw;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

.modal-title {
  color: #eee;
  margin: 0;
  font-size: 16px;
}

.current-identity {
  color: #888;
  font-size: 11px;
  margin: 0 0 4px 0;
  font-family: monospace;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-row label {
  color: #888;
  font-size: 11px;
  text-transform: uppercase;
}

.form-row.checkbox-row {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.form-row.checkbox-row label {
  text-transform: none;
  font-size: 12px;
  color: #aaa;
}

.text-input {
  background: #0a0a0a;
  border: 1px solid #333;
  color: #ddd;
  padding: 6px 8px;
  font-size: 13px;
  font-family: inherit;
  outline: none;
  border-radius: 3px;
}
.text-input:focus { border-color: #4aaef0; }

.error-message {
  color: #ff4a4a;
  font-size: 11px;
  margin: 0;
  word-break: break-word;
}

.button-row {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.btn {
  padding: 6px 12px;
  font-size: 12px;
  font-family: inherit;
  border-radius: 3px;
  cursor: pointer;
  border: 1px solid transparent;
}
.btn:disabled { cursor: not-allowed; opacity: 0.5; }

.btn-secondary {
  background: #333;
  border-color: #444;
  color: #ccc;
}
.btn-secondary:hover:not(:disabled) { background: #444; }

.btn-primary {
  background: #4aaef0;
  border-color: #4aaef0;
  color: #fff;
  font-weight: bold;
}
.btn-primary:hover:not(:disabled) { background: #5dbafa; }
</style>
