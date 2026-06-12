/**
 * src/composables/useEngineControls.ts
 * Engine connection management composable.
 *
 * ## Responsibility
 * This composable is the single point of contact between the UI and the
 * engine's connect/disconnect lifecycle. It exposes reactive state (status,
 * metrics) and named actions (connect, disconnect, toggle). The UI layer
 * never imports `analysisService` or `store.engine` directly for this purpose.
 *
 * ## What this is NOT
 * It does not manage analysis queries, pondering, or move suggestions — those
 * remain in their own composables and services. This composable covers
 * exactly: "is the engine running, and can I start or stop it?"
 *
 * License: Public Domain (The Unlicense)
 */
import { computed } from 'vue';
import { store } from '../store';
import { analysisService } from '../services/analysis-service';
// ── Composable ────────────────────────────────────────────────────────────────
export function useEngineControls() {
    const isConnected = computed(() => store.engine.status === 'connected');
    const status = computed(() => store.engine.status);
    const metrics = computed(() => store.engine.metrics);
    const connect = () => analysisService.connect();
    const disconnect = () => analysisService.disconnect();
    const toggle = () => (isConnected.value ? disconnect() : connect());
    const clearCache = () => { void analysisService.clearCache(); };
    return { isConnected, status, metrics, connect, disconnect, toggle, clearCache };
}
