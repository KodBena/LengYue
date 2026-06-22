/**
 * src/services/system-message-sink.ts
 *
 * Registered sink port for user-visible system messages. Decouples the
 * messaging *producers* (services, state modules, composables) from the
 * store that owns the message list: a producer calls `pushSystemMessage`
 * here, the store registers the concrete write-into-`store.engine.messages`
 * implementation once at init. Breaking the producer→store value import this
 * way drops `services/api-client.ts` (and its cycle-only dependents) out of
 * the store/services import cycle (the cycle-check ratchet, ADR-0011).
 *
 * License: Public Domain (The Unlicense)
 */
import type { SystemMessage } from '../types';

/**
 * The push port. `type` reuses `SystemMessage['type']` so the message-kind
 * vocabulary has one home (the `SystemMessage` value object), not a parallel
 * enum.
 */
export interface SystemMessageSink {
  push(type: SystemMessage['type'], text: string): void;
}

// Module-scope singleton: the store registers exactly one sink at init.
let sink: SystemMessageSink | null = null;

/**
 * Register the concrete sink. Called once by the store at module init
 * (`src/store/index.ts`), after the reactive `store` is defined.
 */
export function registerSystemMessageSink(s: SystemMessageSink): void {
  sink = s;
}

/**
 * Push a system message through the registered sink. Fails loudly (ADR-0002)
 * if no sink is registered: a missing registration is a wiring / bootstrap-
 * order bug, and a silently dropped user-visible message is exactly the
 * silent failure the tenet forbids — surface it at the first push instead.
 */
export function pushSystemMessage(type: SystemMessage['type'], text: string): void {
  if (sink === null) {
    throw new Error(
      'pushSystemMessage called before a SystemMessageSink was registered. ' +
        'The store registers the sink at init (src/store/index.ts); this is a ' +
        'wiring / bootstrap-order bug — a system message would otherwise be ' +
        'silently dropped (ADR-0002).',
    );
  }
  sink.push(type, text);
}
