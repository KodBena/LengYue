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
 * The getResource<T> verb unwraps `.content` so callers never see
 * the envelope.
 *
 * This module is deliberately domain-free: it knows the envelope
 * shape and nothing about any particular resource's payload.
 * Domain orchestration (which resource to fetch, what to do with
 * it) lives with the domain — e.g. the suggestion-color
 * calibration init in
 * `src/composables/board/suggestion-color-calibration.ts`.
 *
 * License: Public Domain (The Unlicense).
 */

import { api } from './api-client';

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
export async function getResource<T>(name: string): Promise<T> {
  const envelope = await api.request<ResourceEnvelope<T>>('GET', `/resources/${name}`);
  return envelope.content;
}
