/**
 * src/services/resource-service.ts
 *
 * Typed client for the Ebisu backend's static resource endpoints
 * (GET /resources/{name}). Uses api-client for transport; any JWT
 * header attached to these unauthenticated endpoints is a benign
 * no-op. Error surfacing (4xx/5xx, network failures) is inherited
 * from api.request — errors land in the system log automatically,
 * so this layer only needs to shape the success path.
 *
 * Wire format: /resources/{name} returns a wrapped envelope
 *   { "name": "<name>", "content": <payload> }
 * The fetchResource<T> helper unwraps `.content` so callers never
 * see the envelope.
 */

import { api } from './api-client';
import { initializeIntensityFactory } from '../engine/suggestion-colors';

/**
 * The on-the-wire envelope returned by GET /resources/{name}.
 * Kept internal: callers see only the unwrapped payload type T.
 */
interface ResourceEnvelope<T> {
  readonly name: string;
  readonly content: T;
}

/**
 * Fetch a named backend resource and return its content.
 *
 * Errors propagate as thrown Errors (with the low-level HTTP error
 * already surfaced to the system log by api.request). A 404 body
 * from the backend includes the list of known resource names, which
 * appears verbatim in the log for diagnostic convenience.
 *
 * @param name  The resource name, e.g. 'visit-distribution'.
 * @returns     The unwrapped payload.
 */
async function fetchResource<T>(name: string): Promise<T> {
  const envelope = await api.request<ResourceEnvelope<T>>('GET', `/resources/${name}`);
  return envelope.content;
}

export class ResourceService {
  /**
   * Loads the KataGo visit-distribution calibration data and hands
   * it to the suggestion-color intensity factory. Fire-and-forget —
   * a failure here emits a system-log message (via api.request) but
   * must not crash the app's onMounted handler in App.vue, hence
   * the catch.
   */
  async loadVisitDistribution(): Promise<void> {
    try {
      const data = await fetchResource<any>('visit-distribution');
      initializeIntensityFactory(data);
    } catch (err) {
      // api.request has already pushed the HTTP-level error to the
      // system log; this catch just prevents the unhandled rejection
      // from escaping into App.vue's startup flow.
      console.error('[ResourceService] Failed to load distribution:', err);
    }
  }
}

export const resourceService = new ResourceService();
