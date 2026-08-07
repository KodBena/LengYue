/**
 * src/composables/useEngineUriEditor.ts
 *
 * Toolbar-and-settings-shared editor state for the engine WebSocket
 * URI. Reads and writes the SAME store cell the Settings tab's
 * Advanced Registry editor targets — `store.profile.settings.engine
 * .katago.url` — through the profile owner's `mutateProfile` (the
 * named-mutator seam `AnalysisControls.vue`'s v-model computeds
 * already use for sibling `engine.katago.*` leaves). ADR-0012: one
 * cell, one home; this composable is a second EDITOR of that cell,
 * never a second cell.
 *
 * Commit semantics: a syntactically invalid URI (`lib/ws-url.ts`)
 * is rejected with a system message and never reaches the store
 * (ADR-0002 fail-loudly — `new WebSocket(...)` throws synchronously
 * and uncaught on a malformed URL, so validating here is the only
 * loud-failure option). A valid, CHANGED value is written, and — if
 * the engine was connected at commit time — the connection is
 * cycled through `useEngineControls`' `disconnect` / `connect`, the
 * same pair the toolbar's CONNECT/DISCONNECT button and every other
 * engine-lifecycle call site use (`connect()` re-reads the store
 * cell fresh, so it picks up the just-written value). No parallel
 * WS-teardown/rebuild is invented here. A disconnected engine is
 * left disconnected — editing the URI does not itself open a
 * connection the user hasn't asked for.
 *
 * License: Public Domain (The Unlicense)
 */

import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { store } from '../store';
import { mutateProfile } from '../store/profile-owner';
import { pushSystemMessage } from '../store';
import { i18n } from '../i18n';
import { validateEngineUri } from '../lib/ws-url';
import { useEngineControls } from './useEngineControls';

export interface EngineUriEditor {
  /** The live stored value — same cell the Settings tab reads. */
  readonly storedUri: ComputedRef<string>;
  /** True while the toolbar affordance is showing its input (vs. its
   *  compact display). */
  readonly isEditing: Ref<boolean>;
  /** The in-progress edit buffer; bound to the input while editing. */
  readonly draft: Ref<string>;
  /** Switch from display to input, seeding the draft from the stored
   *  value. */
  beginEdit: () => void;
  /** Validate and, if valid and changed, commit the draft to the
   *  shared store cell and cycle the connection if it was live.
   *  Invalid input stays in edit mode with the store untouched. */
  commit: () => void;
  /** Discard the draft and leave edit mode without writing. */
  cancel: () => void;
}

export function useEngineUriEditor(): EngineUriEditor {
  const { isConnected, connect, disconnect } = useEngineControls();

  const storedUri = computed(() => store.profile.settings.engine.katago.url);
  const isEditing = ref(false);
  const draft = ref('');

  function beginEdit(): void {
    draft.value = storedUri.value;
    isEditing.value = true;
  }

  function cancel(): void {
    draft.value = storedUri.value;
    isEditing.value = false;
  }

  function commit(): void {
    // Guard against commit paths firing after the edit ended (e.g. a
    // blur event racing a cancel — review finding 1's class): once the
    // editor is closed there is no draft to commit.
    if (!isEditing.value) return;
    const validation = validateEngineUri(draft.value);
    if (!validation.ok) {
      pushSystemMessage('error', i18n.global.t(validation.errorKey));
      return; // Stay in edit mode; the stored cell is untouched.
    }

    const next = draft.value.trim();
    isEditing.value = false;

    if (next === storedUri.value) {
      return; // No-op commit — nothing changed, nothing to reconnect.
    }

    const wasConnected = isConnected.value;
    mutateProfile((profile) => {
      profile.settings.engine.katago.url = next;
    });

    if (wasConnected) {
      // Same reconnect pair the toolbar's CONNECT/DISCONNECT button
      // uses (useEngineControls -> analysisService). `connect()`
      // reads `store.profile.settings.engine.katago.url` fresh, so
      // it picks up `next` without an explicit override argument.
      disconnect();
      connect();
    }
  }

  return { storedUri, isEditing, draft, beginEdit, commit, cancel };
}
