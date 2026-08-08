<!--
  src/components/ProxyUpstreamSettingField.vue
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
/**
 * The desktop-only proxy-upstream field, extracted as ONE shared leaf
 * so `WizardStepEngineUri.vue` and `SettingsTab.vue`'s Session sub-tab
 * render IDENTICAL markup/behavior instead of two hand-duplicated
 * copies (ADR-0012 one-cell-one-home, extended here to "one RENDERING,
 * one home" — the two call sites had drifted: the wizard's error-state
 * ref was a plain non-reactive `let` that never re-rendered on a failed
 * save, fresh-context review blocker 2, while Settings' copy already
 * used `ref('')` correctly. Single source now removes the class of bug,
 * not just this instance of it.
 *
 * `fieldId` lets each caller keep its own stable DOM id (existing tests
 * select `#wizard-proxy-upstream` / `#settings-proxy-upstream`) even
 * though both mounts are TWO INSTANCES of this one component (Settings'
 * `TabWidget` uses `keep-mounted`, so both this component's mounts and
 * the wizard's can coexist in the DOM at once — duplicate ids would be
 * invalid HTML without the prop).
 *
 * `v-if="proxyUpstream.isTauri"` lives INSIDE this component (not left
 * to each caller) so there is exactly one place the Tauri gate is
 * decided for this field, matching `useProxyUpstreamSetting`'s own
 * "inert, not just hidden" contract — a caller cannot forget the gate.
 */
import { ref, onMounted } from 'vue';
import { useProxyUpstreamSetting } from '../composables/useProxyUpstreamSetting';

defineProps<{
  /** Stable DOM id for the `<input>`/`<label for>` pair — callers pass
   *  their own so two simultaneously-mounted instances never collide. */
  fieldId: string;
}>();

const proxyUpstream = useProxyUpstreamSetting();
onMounted(() => proxyUpstream.load());

const errorKey = ref('');
// True right after a successful save, until the user edits the draft
// again — surfaces `proxyUpstream.restartNotice` (previously a DEAD
// key: defined in en.json but never rendered anywhere; fresh-context
// review flagged it). The field's persistent `.hint` already carries
// the general "not live until restart" caveat; this is the in-the-
// moment "your save actually went through" confirmation.
const justSaved = ref(false);

async function commit(): Promise<void> {
  const result = await proxyUpstream.save();
  errorKey.value = result.ok ? '' : result.errorKey;
  justSaved.value = result.ok;
}
function onDraftInput(): void {
  justSaved.value = false; // editing again supersedes the last save's confirmation
}
</script>

<template>
  <div v-if="proxyUpstream.isTauri" class="proxy-upstream-field">
    <label class="proxy-upstream-field-label" :for="fieldId">{{ $t('proxyUpstream.label') }}</label>
    <input
      :id="fieldId"
      v-model="proxyUpstream.draft.value"
      type="text"
      spellcheck="false"
      :placeholder="$t('proxyUpstream.placeholder')"
      @input="onDraftInput()"
      @keydown.enter="commit()"
      @blur="commit()"
    />
    <p v-if="errorKey" class="proxy-upstream-field-msg proxy-upstream-field-error" role="alert">{{ $t(errorKey) }}</p>
    <p v-else-if="justSaved" class="proxy-upstream-field-msg" role="status">{{ $t('proxyUpstream.restartNotice') }}</p>
    <p v-else-if="proxyUpstream.info.value?.envOverrideActive" class="proxy-upstream-field-msg">
      {{ $t('proxyUpstream.envOverrideNotice', { value: proxyUpstream.info.value.effective }) }}
    </p>
    <p v-else class="proxy-upstream-field-msg">{{ $t('proxyUpstream.hint') }}</p>
  </div>
</template>

<style scoped>
.proxy-upstream-field { display: flex; flex-direction: column; gap: var(--space-tight); }
.proxy-upstream-field-label { color: var(--text-1); font-size: var(--text-emphasis); }
.proxy-upstream-field input {
  background: var(--surface-0); border: 1px solid var(--border-2); color: var(--text-0);
  padding: var(--space-default); font-size: var(--text-emphasis); font-family: monospace;
  border-radius: var(--radius-default); outline: none; width: 100%; box-sizing: border-box;
}
.proxy-upstream-field input:focus { border-color: var(--accent-primary); }
.proxy-upstream-field-msg { color: var(--text-2); font-size: var(--text-emphasis); margin: 0; }
.proxy-upstream-field-msg.proxy-upstream-field-error { color: var(--state-error); }
</style>
