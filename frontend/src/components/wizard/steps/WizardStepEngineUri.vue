<!--
  src/components/wizard/steps/WizardStepEngineUri.vue
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
/**
 * Wizard step (b) — ENGINE URI. Reuses `useEngineUriEditor`
 * verbatim — the SAME composable `ToolbarEngineUri.vue` mounts,
 * reading/writing the SAME cell
 * (`profile.settings.engine.katago.url`). This leaf just renders the
 * editor's input always-open (vs. the toolbar's click-to-edit
 * compact display), since a wizard step has room and the affordance
 * should be self-evident without a click-to-reveal step. No second
 * validator, no second store cell — `beginEdit()` on mount seeds the
 * draft from the live value exactly as the toolbar leaf's click
 * handler does.
 *
 * Desktop-only addition (ledger rows 860-862): under Tauri, this step
 * ALSO carries the bundled proxy's own upstream field, via the shared
 * `ProxyUpstreamSettingField.vue` — the SAME component
 * `SettingsTab.vue`'s Session sub-tab mounts (ADR-0012 one-cell-one-home,
 * extended to one-rendering-one-home; see that component's header for
 * why the wizard/Settings duplication was collapsed). The component
 * owns its own `IS_TAURI` gate internally, so nothing here needs to
 * check it.
 */
import { onMounted } from 'vue';
import { useEngineUriEditor } from '../../../composables/useEngineUriEditor';
import ProxyUpstreamSettingField from '../../ProxyUpstreamSettingField.vue';

const editor = useEngineUriEditor();
onMounted(() => editor.beginEdit());
</script>

<template>
  <div class="wizard-step-engine-uri">
    <p class="step-description">{{ $t('wizard.step.engineUri.description') }}</p>
    <label class="field-label" for="wizard-engine-uri">{{ $t('wizard.engineUri.label') }}</label>
    <input
      id="wizard-engine-uri"
      v-model="editor.draft.value"
      type="text"
      class="text-input"
      spellcheck="false"
      @keydown.enter="editor.commit()"
      @blur="editor.commit()"
    />
    <p class="field-hint">{{ $t('wizard.engineUri.hint') }}</p>

    <ProxyUpstreamSettingField field-id="wizard-proxy-upstream" class="proxy-upstream-slot" />
  </div>
</template>

<style scoped>
.wizard-step-engine-uri { display: flex; flex-direction: column; gap: var(--space-default); }
.step-description { color: var(--text-1); margin: 0 0 var(--space-default) 0; }
.field-label { color: var(--text-2); font-size: var(--text-emphasis); text-transform: uppercase; }
.proxy-upstream-slot { margin-top: var(--space-default); }
.text-input {
  background: var(--surface-0); border: 1px solid var(--border-2); color: var(--text-0);
  padding: var(--space-default); font-size: var(--text-emphasis); font-family: monospace;
  border-radius: var(--radius-default); outline: none; width: 100%; box-sizing: border-box;
}
.text-input:focus { border-color: var(--accent-primary); }
.field-hint { color: var(--text-2); font-size: var(--text-emphasis); margin: 0; }
</style>
