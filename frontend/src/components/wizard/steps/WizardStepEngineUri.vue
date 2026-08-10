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
 * check it. It also owns the mDNS upstream-discovery affordance
 * (ledger row 944, `discover_upstreams`) entirely internally — this
 * step just embeds the leaf and knows nothing about discovery.
 *
 * Copy rewrite (commissioner, ledger rows 1361/1362): the description
 * used to LEAD with proxy architecture and packaging variants
 * ("normally the local proxy already wired up for you in the Docker
 * and desktop builds…"), and the hint cited `docs/docker.md` — a repo
 * path — to end users (audit M18). The lead now states the single
 * decision in plain language; the architecture/packaging detail moved
 * into the `<details class="settings-section">` disclosure below,
 * written as deployment-neutral peer cases (Docker / desktop / source),
 * matching `WizardStepPalette.vue`'s ADVANCED disclosure idiom
 * (`shared-chrome.css`'s `.settings-section`/`.branch-header` rules —
 * global CSS, no scoped import needed here). The repo-path citation is
 * gone entirely; the disclosure instead points at the install's own
 * shipped documentation, with no path.
 *
 * TEST-CONNECTION affordance (commissioner scope expansion, ledger
 * rows 1365/1366 — "psychological comfort" of a right-there probe).
 * `probeEngineUri` (`lib/engine-uri-probe.ts`) is a fresh, minimal,
 * bounded WebSocket-open probe — checked first for an existing
 * connection-test utility in the engine/proxy service layer and found
 * none (see that file's header for what was checked). PROBE-ONLY: it
 * is never wired to `useEngineControls`/`analysisService`, never
 * mutates `store.engine` or the URI store cell, and never auto-connects
 * — it probes whatever is CURRENTLY TYPED in `editor.draft`, which may
 * differ from the committed/connected value. The status chip reuses
 * `AnalysisControls.vue`'s `.engine-status-chip` idiom verbatim
 * (opaque border + `currentColor`, icon shape differs per state, never
 * color alone — that component's M11 finding).
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useEngineUriEditor } from '../../../composables/useEngineUriEditor';
import ProxyUpstreamSettingField from '../../ProxyUpstreamSettingField.vue';
import { WIZARD_PROSE_MEASURE_CH } from '../../../state/layout-model';
import { validateEngineUri } from '../../../lib/ws-url';
import { probeEngineUri } from '../../../lib/engine-uri-probe';

const editor = useEngineUriEditor();
onMounted(() => editor.beginEdit());

// ── Test-connection affordance (probe-only; see header) ────────────────────
type TestState = 'idle' | 'probing' | 'reachable' | 'unreachable';
type ProbeReason = 'timeout' | 'error';
const testState = ref<TestState>('idle');
const testReason = ref<ProbeReason>('error');

// A stale reachable/unreachable badge for a value the user has since
// edited would misrepresent the field's CURRENT content — reset to
// idle the moment the draft changes after a probe settled.
watch(() => editor.draft.value, () => {
  if (testState.value !== 'probing') testState.value = 'idle';
});

const canTest = computed(() => testState.value !== 'probing' && validateEngineUri(editor.draft.value).ok);

async function runTest(): Promise<void> {
  if (!canTest.value) return;
  const uri = editor.draft.value.trim();
  testState.value = 'probing';
  const result = await probeEngineUri(uri);
  // The draft may have changed while the probe was in flight; a result
  // for a since-abandoned value is not worth displaying.
  if (editor.draft.value.trim() !== uri) return;
  if (result.ok) {
    testState.value = 'reachable';
  } else {
    testReason.value = result.reason;
    testState.value = 'unreachable';
  }
}

// Icon shape differs per state, not only color (ADR-0019 appendix C18
// "never color alone" — same discipline `AnalysisControls.vue`'s
// `.engine-status-chip` follows, whose CSS this chip's classes reuse).
const testChipIcon = computed(() => {
  if (testState.value === 'probing') return '◐';
  if (testState.value === 'reachable') return '●';
  return '○'; // unreachable
});
const testChipClass = computed(() => `is-${testState.value}`);

// R7 measure cap (audit finding: this step's description/hint were
// running ~101-107ch/line against the wizard card's full width) —
// `v-bind` in the <style> block keeps this in sync with
// `WIZARD_PROSE_MEASURE_CH`, no second hand-typed `ch` literal. The
// `[data-prose-measure-ch]` attribute below binds the SAME constant
// so a test can assert the container carries it without depending on
// jsdom computing `v-bind`-driven CSS custom properties (this repo's
// vitest config sets `css: false` — no style tag ever reaches the
// test DOM, only script-level bindings do).
const wizardProseMaxWidthCss = computed(() => `${WIZARD_PROSE_MEASURE_CH}ch`);
</script>

<template>
  <div class="wizard-step-engine-uri">
    <p class="step-description" :data-prose-measure-ch="WIZARD_PROSE_MEASURE_CH">{{ $t('wizard.step.engineUri.description') }}</p>
    <label class="field-label" for="wizard-engine-uri">{{ $t('wizard.engineUri.label') }}</label>
    <div class="uri-row">
      <input
        id="wizard-engine-uri"
        v-model="editor.draft.value"
        type="text"
        class="text-input"
        spellcheck="false"
        @keydown.enter="editor.commit()"
        @blur="editor.commit()"
      />
      <button
        type="button"
        class="test-btn"
        :disabled="!canTest"
        data-testid="wizard-engine-uri-test-button"
        @click="runTest"
      >{{ $t('wizard.engineUri.test.button') }}</button>
    </div>

    <div
      v-if="testState !== 'idle'"
      class="test-status-chip"
      :class="testChipClass"
      data-testid="wizard-engine-uri-test-chip"
    >
      <span class="test-status-icon" aria-hidden="true">{{ testChipIcon }}</span>
      <span v-if="testState === 'probing'">{{ $t('wizard.engineUri.test.probing') }}</span>
      <span v-else-if="testState === 'reachable'">{{ $t('wizard.engineUri.test.reachable') }}</span>
      <span v-else>{{ $t('wizard.engineUri.test.unreachable', { reason: $t(`wizard.engineUri.test.reason.${testReason}`) }) }}</span>
    </div>

    <p class="field-hint" :data-prose-measure-ch="WIZARD_PROSE_MEASURE_CH">{{ $t('wizard.engineUri.hint') }}</p>

    <details class="settings-section engine-connection-details">
      <summary class="branch-header"><h3>{{ $t('wizard.engineUri.details.summary') }}</h3></summary>
      <div class="details-content" :data-prose-measure-ch="WIZARD_PROSE_MEASURE_CH">
        <p>{{ $t('wizard.engineUri.details.docker') }}</p>
        <p>{{ $t('wizard.engineUri.details.desktop') }}</p>
        <p>{{ $t('wizard.engineUri.details.source') }}</p>
        <p>{{ $t('wizard.engineUri.details.docs') }}</p>
      </div>
    </details>

    <ProxyUpstreamSettingField field-id="wizard-proxy-upstream" class="proxy-upstream-slot" />
  </div>
</template>

<style scoped>
.wizard-step-engine-uri { display: flex; flex-direction: column; gap: var(--space-default); }
.step-description { color: var(--text-1); margin: 0 0 var(--space-default) 0; max-width: v-bind(wizardProseMaxWidthCss); }
.field-label { color: var(--text-2); font-size: var(--text-emphasis); text-transform: uppercase; }
.proxy-upstream-slot { margin-top: var(--space-default); }
.uri-row { display: flex; gap: var(--space-default); align-items: stretch; }
.text-input {
  background: var(--surface-0); border: 1px solid var(--border-2); color: var(--text-0);
  padding: var(--space-default); font-size: var(--text-emphasis); font-family: monospace;
  border-radius: var(--radius-default); outline: none; width: 100%; box-sizing: border-box;
  flex: 1; min-width: 0;
}
.text-input:focus { border-color: var(--accent-primary); }
.field-hint { color: var(--text-2); font-size: var(--text-emphasis); margin: 0; max-width: v-bind(wizardProseMaxWidthCss); }

.test-btn {
  background: var(--surface-0); border: 1px solid var(--border-2); color: var(--text-0);
  padding: 0 var(--space-medium); font-size: var(--text-emphasis); font-family: inherit;
  border-radius: var(--radius-default); cursor: pointer; white-space: nowrap;
}
.test-btn:hover:not(:disabled) { border-color: var(--accent-primary); }
.test-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* Same opaque "colored border + colored text against the panel's own
   background" idiom as AnalysisControls.vue's .engine-status-chip
   (that component's M11 finding) — no translucent fill, icon shape
   differs per state so color is never the only channel. */
.test-status-chip {
  display: inline-flex; align-items: center; gap: var(--space-tight);
  padding: 1px 8px; border-radius: var(--radius-default);
  border: 1px solid currentColor; font-weight: bold; font-size: var(--text-body);
  align-self: flex-start;
}
.test-status-chip.is-probing { color: var(--text-2); }
.test-status-chip.is-reachable { color: var(--state-success); }
.test-status-chip.is-unreachable { color: var(--state-error); }
.test-status-icon { font-size: var(--text-emphasis); line-height: 1; }

.details-content { display: flex; flex-direction: column; gap: var(--space-default); padding-top: var(--space-default); }
.details-content p { color: var(--text-1); margin: 0; max-width: v-bind(wizardProseMaxWidthCss); }
</style>
