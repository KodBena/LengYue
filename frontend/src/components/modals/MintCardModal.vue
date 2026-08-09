<!-- 
  src/components/modals/MintCardModal.vue
  Floating modal for flashcard minting and tag management.
  License: Public Domain (The Unlicense)
-->
<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { store, pushSystemMessage } from '../../store';
import { useMinting, compileMintGradingParameter, resolveBoardLineageAsBatchFallback } from '../../composables/review/useMinting';
import { useMetadata } from '../../composables/auth-app/useMetadata';
import { getSelectedNodeIds, removeFromSelection } from '../../composables/cards/mint-selection';
import { buildBatchMintPayload, filterUncardedSelection } from '../../composables/cards/batch-mint-core';
import { getCachedNodeHash } from '../../state/node-position-hashes';
import { getKnownPositionHashes } from '../../state/known-positions';
import { serializeActivePath } from '../../engine/sgf-writer';
import { useModalKeyboard } from '../../composables/useModalKeyboard';
import { useAppDialogs } from '../../composables/useAppDialogs';
import type { BoardId, NodeId } from '../../types';
import { INTERACTION_DISMISS_DELAY_MS } from '../../lib/timing';

const { t } = useI18n();
const dialogs = useAppDialogs();
const {
  calibrateKomiOnDraft,
  commitMintBatch,
  checkDuplicate,
  resetDuplicateCheck,
  duplicateCheckStatus,
  duplicateCardId,
} = useMinting();

const isOpen = ref(false);
const modalContentRef = ref<HTMLElement | null>(null);
const isLoading = ref(false);
const draftBoardId = ref<BoardId | null>(null);

// ── Batch card-minting affordance (commissioner-designed, ledger rows
//    926/957/1008) — ONE code path, not two ─────────────────────────────
//
// "Mint card(s)": `mintNodeIds` is the set of positions THIS submit
// will mint — ALWAYS non-empty, ALWAYS resolved at `open()` time, and
// ALWAYS minted through the SAME single call, `commitMintBatch`
// (`POST /cards/batch`). An empty mint-selection at open() time
// resolves to a one-element Set of the board's current node — "nothing
// marked IMPLIES the current node is marked" (commissioner's wording).
// There is no separate size-based branch to the OLD single-item
// `POST /cards/` endpoint anywhere in this file; `useMinting.
// commitMint`/`prepareDraft` were retired along with that second path
// (no other caller remained — see the closing report).
//
// `isSingleCard` gates ONLY the duplicate-check control, which is
// inherently single-position (a batch of N has N positions to check,
// out of this build's scope) — never the wire call itself, which is
// always `commitMintBatch` regardless of size. Komi calibration is
// NOT gated on size (commissioner ruling, ledger row 1063): it applies
// to EVERY card in the batch, each calibrated to its OWN position —
// see the `calibrateKomi`/`submit()` per-card loop below.
const mintNodeIds = ref<ReadonlySet<NodeId>>(new Set());
const isSingleCard = computed(() => mintNodeIds.value.size === 1);
const mintCount = computed(() => mintNodeIds.value.size);

// Shared draft settings (num_moves / grading_parameter / tags) applied
// uniformly to every card in the batch, degenerate size-1 batch
// included — replaces the old per-single-mint `draft` object.
interface SharedDraft {
  num_moves: number;
  grading_parameter: Record<string, unknown> | null;
  tags: string[];
}
const draft = ref<SharedDraft | null>(null);

// Tag Input State
const tagInput = ref('');
const showSuggestions = ref(false);

// Palette Override State
const selectedPaletteId = ref<string>('active');

// ── Komi calibration (opt-in, pedagogical) ───────────────────────────
// The two controls appear only when an engine is connected — the same
// `store.engine.status === 'connected'` predicate the keybindings
// catalog's `engineConnected` uses. Strictly opt-in: the checkbox is
// unchecked by default. The visits input prefills from the user setting
// but per-mint edits do NOT write back to it (a local ref, not bound to
// the store).
const engineConnected = computed(() => store.engine.status === 'connected');
const calibrateKomi = ref(false);
const calibrationVisits = ref<number>(store.profile.settings.engine.katago.calibrationVisits);

const activeBoard = computed(() => draftBoardId.value ? store.boards.find(b => b.id === draftBoardId.value) : undefined);

// Single-card lineage display (the `isSingleCard` template branch) —
// mirrors the board-level XOR rule `resolveBoardLineage` applies for
// the wire payload; display-only here (the actual wire `parent_ref`
// for the batch is resolved independently, per node, in `submit()`).
const singleCardParentId = computed(() => activeBoard.value?.sourceCardId);

const palettes = computed(() => store.profile.settings.engine.katago.analysis_env.palettes);

// Typed accessors for the two editable fields inside `grading_parameter`.
// The wire shape declares `grading_parameter: { [key: string]: unknown } | null`
// (OpenAPI-honest about the blob's opacity), but `open()` (below)
// populates `data.default_visits: number` and `data.gamma: number` via
// `compileMintGradingParameter` before the modal renders, and the
// modal's contract is to surface those two fields as editable. The
// localized casts widen at the access boundary; the rest of the blob
// stays opaque. Read-side counterparts are the
// `readGradingParam<number>` calls in
// `services/backend-service.ts::mapToReviewCard`.
const defaultVisits = computed<number>({
  get() {
    // untyped wire blob: assert the one field this getter reads (see header).
    const gp = draft.value?.grading_parameter as
      | { data?: { default_visits?: number } }
      | null
      | undefined;
    return gp?.data?.default_visits ?? 1000;
  },
  set(v: number) {
    if (!draft.value) return;
    // untyped wire blob: assert the data sub-object this setter writes.
    const gp = draft.value.grading_parameter as
      | { data: Record<string, unknown> }
      | null;
    if (gp?.data) gp.data.default_visits = v;
  },
});

const gamma = computed<number>({
  get() {
    // untyped wire blob: assert the one field this getter reads (see header).
    const gp = draft.value?.grading_parameter as
      | { data?: { gamma?: number } }
      | null
      | undefined;
    return gp?.data?.gamma ?? 0.9;
  },
  set(v: number) {
    if (!draft.value) return;
    // untyped wire blob: assert the data sub-object this setter writes.
    const gp = draft.value.grading_parameter as
      | { data: Record<string, unknown> }
      | null;
    if (gp?.data) gp.data.gamma = v;
  },
});

const filteredTags = computed(() => {
  const query = tagInput.value.toLowerCase().trim();
  if (!query) return [];
  return store.knownTags.filter(t =>
    t.toLowerCase().includes(query) && !draft.value?.tags.includes(t)
  ).slice(0, 8); // Max 8 suggestions
});

defineExpose({
  async open(boardId: BoardId) {
    const board = store.boards.find(b => b.id === boardId);
    if (!board) return;

    selectedPaletteId.value = store.profile.settings.minting.defaultPaletteId;

    // "Nothing marked IMPLIES the current node is marked" — the ONLY
    // place this resolution happens; every downstream step (settings,
    // duplicate check, calibration gating, submit) reads `mintNodeIds`,
    // never re-branches on "was there a selection."
    const selection = getSelectedNodeIds(boardId);
    mintNodeIds.value = selection.size > 0 ? new Set(selection) : new Set([board.currentNodeId]);

    draft.value = {
      num_moves: store.profile.settings.minting.defaultNumMoves,
      grading_parameter: compileMintGradingParameter(),
      tags: [],
    };
    draftBoardId.value = boardId;
    isOpen.value = true;
    tagInput.value = '';

    // Reset calibration to its opt-in default each open; prefill the
    // visits input from the current setting (per-mint edits don't
    // write back). Batch-wide (ledger row 1063) — offered whenever an
    // engine is connected, regardless of `mintNodeIds`'s size.
    calibrateKomi.value = false;
    calibrationVisits.value = store.profile.settings.engine.katago.calibrationVisits;

    // card-position-annotations Stage A: duplicate-position check —
    // only meaningful for a single card (a batch of N has N positions
    // to check, out of scope for this build's duplicate-warning UI).
    // Fired without awaiting — the modal must render immediately;
    // the warning box appears once the async check settles.
    resetDuplicateCheck();
    if (mintNodeIds.value.size === 1) {
      const [nodeId] = mintNodeIds.value;
      void checkDuplicate(serializeActivePath(board, nodeId));
    }
  }
});

function close() {
  isOpen.value = false;
  draft.value = null;
  draftBoardId.value = null;
  mintNodeIds.value = new Set();
  resetDuplicateCheck();
}

// Escape → same close path as the Cancel/× buttons (ADR-0019 S5);
// Tab focus trap + initial focus + focus restoration — all one
// shared mechanism, see useModalKeyboard.ts. (The tag input's own
// Escape handler below, `handleTagKeydown`, stops propagation so
// a first Escape closes the suggestions dropdown only; a second
// Escape — dropdown already closed — reaches this and closes the
// modal.)
useModalKeyboard(modalContentRef, isOpen, close);

// ─── Tag Management ──────────────────────────────────────────────────────────

function addTag(tag: string) {
  const cleanTag = tag.trim().toLowerCase();
  if (!cleanTag || !draft.value) return;
  
  if (!draft.value.tags.includes(cleanTag)) {
    draft.value.tags.push(cleanTag);
  }
  tagInput.value = '';
  showSuggestions.value = false;
}

function handleTagKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    addTag(tagInput.value);
  } else if (e.key === 'Backspace' && tagInput.value === '' && draft.value?.tags.length) {
    draft.value.tags.pop();
  } else if (e.key === 'Escape') {
    if (showSuggestions.value) {
      // Contain the first Escape to the suggestions dropdown; don't
      // let it also bubble to the modal-level handler and discard
      // the in-progress draft in the same keypress.
      e.stopPropagation();
      showSuggestions.value = false;
    }
  } else {
    showSuggestions.value = true;
  }
}

function removeTag(index: number) {
  if (draft.value) draft.value.tags.splice(index, 1);
}

/**
 * Hide the suggestions dropdown after a short delay.
 *
 * Why the delay: `@blur` on the input fires *before* a click on a
 * suggestion list item is processed. If we hid the dropdown
 * synchronously, the click handler (`@mousedown.prevent="addTag(...)"`)
 * would never fire because the element it targets would already be
 * gone from the DOM. The 150 ms window is comfortable on most
 * devices; lower values risk dropping the click on slower hardware.
 *
 * Hoisted out of the template because Vue templates only see script-
 * exposed identifiers, not browser globals like `setTimeout` —
 * referencing it inline produces a TS2339 error under strict mode
 * (the auto-generated component instance type doesn't include
 * browser globals).
 */
// Tracks the in-flight setTimeout handle for hideSuggestionsDelayed
// so we can clear it on unmount (and on overlapping schedules — a
// rapid blur-focus-blur sequence would otherwise queue duplicate
// callbacks). The post-unmount write to showSuggestions.value would
// be a closure-stable no-op, but releasing the timer is the
// discipline-correct shape.
let suggestionsHideTimer: number | null = null;

function hideSuggestionsDelayed() {
  if (suggestionsHideTimer !== null) {
    clearTimeout(suggestionsHideTimer);
  }
  // Suggestions-hide delay — gives the user time to mousedown on a
  // suggestion before the dropdown closes on input blur. The shared
  // interaction-dismiss grace from the timing catalog (`lib/timing`).
  suggestionsHideTimer = window.setTimeout(() => {
    showSuggestions.value = false;
    suggestionsHideTimer = null;
  }, INTERACTION_DISMISS_DELAY_MS);
}

onUnmounted(() => {
  if (suggestionsHideTimer !== null) clearTimeout(suggestionsHideTimer);
});

// ─── Submission ──────────────────────────────────────────────────────────────

async function submit() {
  if (!draft.value) return;
  isLoading.value = true;

  // Flush a typed-but-uncommitted tag. A user who types a tag and
  // clicks Mint without pressing Enter/comma (so it never became a
  // chip) would otherwise have it silently dropped — it lives in
  // `tagInput`, never pushed to `draft.tags`, so the card mints
  // without it. `addTag` normalizes + dedups and clears `tagInput`.
  if (tagInput.value.trim()) addTag(tagInput.value);

  // Apply Palette Override if one was specifically chosen.
  // 34b: The override rebuilds `grading_parameter` from the palette, so we
  // must re-attach `default_visits` and `gamma` afterwards — otherwise
  // we'd clobber the values the user may have edited in the modal.
  if (selectedPaletteId.value !== 'active') {
    const env = store.profile.settings.engine.katago.analysis_env;
    const p = env.palettes.find(x => x.id === selectedPaletteId.value);
    if (p) {
      // Local cast at the read site: the wire shape's `grading_parameter`
      // is `{[key: string]: unknown} | null`; the create-flow contract
      // populates `data.default_visits` and `data.gamma` (see
      // `compileMintGradingParameter`, called from `open()` above).
      const gp = draft.value.grading_parameter as
        | { data?: { default_visits?: number; gamma?: number } }
        | null;
      const preservedVisits = gp?.data?.default_visits;
      const preservedGamma = gp?.data?.gamma;
      draft.value.grading_parameter = {
        data: {
          analysis_config: {
            bindings: { delta_fn: p.delta_fn, state_fns: p.state_fns, summary_fn: p.summary_fn },
            parameters: env.parameters,
            symbols: env.symbols
          },
          default_visits: preservedVisits,
          gamma: preservedGamma
        }
      };
    }
  }

  // ONE code path: always builds and sends exactly one
  // `POST /cards/batch` call (`commitMintBatch`) for the UNCARDED
  // subset of `mintNodeIds` — whether that's the N nodes the user
  // ctrl+clicked, or the one-element degenerate Set `open()` resolved
  // from an empty selection. There is no size-based branch to a second
  // wire call.
  if (!draftBoardId.value) { isLoading.value = false; return; }
  const boardIdForMint = draftBoardId.value;

  // Tracks whether a requested calibration is still the in-flight step,
  // so the catch can attribute the failure correctly: a throw while this
  // is true is a CALIBRATION failure (calibration-failed message); a
  // throw after it clears came from the mint itself (mint-failed alert
  // only).
  let calibrationPending = false;
  try {
    const board = store.boards.find(b => b.id === boardIdForMint);
    if (!board) throw new Error(`Mint card(s): board ${boardIdForMint} not found.`);

    // Pre-existing-card exclusion, type-level (commissioner ruling,
    // ledger row 1063): "positions that already have cards must never
    // enter the batch-mint pipeline — filtered by construction, not by
    // dialog." `filterUncardedSelection` is the ONLY way to produce an
    // `UncardedNodeId` — `buildBatchMintPayload` below refuses a plain
    // `NodeId` set. `getCachedNodeHash` / `getKnownPositionHashes` are
    // the same per-node hash cache and known-hashes set
    // `useKnownPositionNodes.ts` already reads for TreeWidget's own
    // "already a card" ring — see `filterUncardedSelection`'s own doc
    // comment for the cache-miss accepted-cost posture.
    const uncarded = filterUncardedSelection(mintNodeIds.value, getCachedNodeHash, getKnownPositionHashes());
    // Positions excluded here can NEVER mint (they already have a
    // card) — drop them from the live selection unconditionally, not
    // just on a successful mint below.
    if (uncarded.excludedAsKnown.length > 0) {
      removeFromSelection(boardIdForMint, uncarded.excludedAsKnown);
    }
    if (uncarded.ids.size === 0) {
      // Honest empty-batch reflection (ruling: "the mint affordance
      // reflects that state honestly rather than posting an empty
      // batch") — no wire call, modal stays open.
      void dialogs.alert({
        title: t('mint.alert.allKnown'),
        message: t('mint.alert.allKnownRemediation'),
      });
      return;
    }

    const metadata = useMetadata(computed(() => board)).value;
    const { fallbackParentRef, fallbackGameMetadata } = resolveBoardLineageAsBatchFallback(board, metadata);
    const built = buildBatchMintPayload({
      board,
      selectedNodeIds: uncarded.ids,
      fallbackParentRef,
      fallbackGameMetadata,
      numMoves: draft.value.num_moves,
      gradingParameter: draft.value.grading_parameter,
      tags: draft.value.tags,
    });

    // Komi calibration (opt-in, pedagogical; commissioner ruling,
    // ledger row 1063: BATCH-WIDE, not size-gated). Applies to EVERY
    // card in the batch — each calibrated to its OWN position (a
    // fresh bounded evaluation per card, sequential: `calibrate`'s
    // one-shot connection lifecycle is owned per call, and the walk is
    // already a blocking step behind `isLoading`). `calibrateKomiOnDraft`
    // rewrites `built.cards[i]`'s SGF komi so the minted card stores
    // the even-game komi, already rounded to the nearest half-integer
    // and clamped to KataGo's accepted [-150, 150] range — ~0.5 point
    // from even is the best achievable and is never chased further
    // (`engine/katago/komi-calibration.ts`). If ANY evaluation fails
    // (engine disconnect, error packet, timeout), `calibrateKomiOnDraft`
    // throws and we ABORT THE WHOLE MINT loudly (ADR-0002) — the catch
    // below surfaces the failure and NO card is created (the batch
    // call hasn't fired yet, so a mid-loop failure never leaves a
    // partially-calibrated batch on the wire).
    if (calibrateKomi.value && engineConnected.value) {
      calibrationPending = true;
      let clampedCount = 0;
      for (let i = 0; i < built.cards.length; i++) {
        const result = await calibrateKomiOnDraft(
          boardIdForMint, built.cards[i], calibrationVisits.value, built.nodeOrder[i],
        );
        if (result.clamped) clampedCount++;
      }
      calibrationPending = false;
      // System-log a batch-wide summary; name the clamped count when
      // any card's computed komi fell outside KataGo's range so the
      // user isn't surprised by an out-of-range adjustment.
      pushSystemMessage(
        'info',
        clampedCount > 0
          ? t('mint.komiCalibration.setBatchClamped', { n: built.cards.length, clamped: clampedCount })
          : t('mint.komiCalibration.setBatch', { n: built.cards.length }),
      );
    }

    await commitMintBatch(built);
    // Lifecycle: a successful mint clears ONLY the minted entries — any
    // node selected AFTER the draft opened stays selected.
    removeFromSelection(boardIdForMint, built.nodeOrder);
    close();
  } catch (err) {
    console.error('[Minting] Failed to create card(s):', err);
    // A calibration failure aborts the mint loudly (ADR-0002) — surface
    // it in the system log as an error so the user knows nothing was
    // created and why, then fall through to the existing alert. Scoped
    // to throws from the calibration step itself: a post-calibration
    // batch-call failure must not be mislabelled as a calibration
    // failure (coordinator gate correction, PR #434).
    if (calibrationPending) {
      pushSystemMessage('error', t('mint.komiCalibration.failed', { err: String(err) }));
    }
    // A failed batch is transactional (backend rolls back the whole
    // request) — the selection is left INTACT for anything that made
    // it into the payload (no `removeFromSelection(...built.nodeOrder)`
    // call above this catch — the already-known exclusions above are a
    // separate, permanent fact and stay removed), so the user can
    // retry unchanged.
    //
    // Sanctioned in-app alert (ADR-0019 S14) wraps the English `${err}`
    // per the (a) backend-error pass-through approach (see
    // frontend/docs/i18n.md). C8: the message names the remediation
    // (retry Mint Card(s)) — the modal stays open on failure so that
    // next action is reachable without navigating anywhere. Not
    // awaited: the dialog is non-blocking, unlike the native alert() it
    // replaces.
    void dialogs.alert({
      title: t('mint.alert.failed', { err: String(err) }),
      message: t('mint.alert.failedRemediation'),
    });
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div v-if="isOpen" class="modal-backdrop" @mousedown.self="close">
    <div ref="modalContentRef" class="modal-content" role="dialog" aria-modal="true" aria-labelledby="mint-card-title" tabindex="-1">

      <div class="modal-header">
        <h2 id="mint-card-title">{{ $t('mint.title') }}</h2>
        <button class="close-btn" @click="close">×</button>
      </div>

      <div class="modal-body" v-if="draft">

        <!-- Batch summary (mintCount > 1) — a batch's per-node parent
             linkage (ancestor-in-selection -> batch_index, else the
             board's own lineage) is resolved individually per card at
             submit time (`buildBatchMintPayload`), not a single value
             this box could show. -->
        <div v-if="!isSingleCard" class="lineage-box branch">
          <span class="lineage-icon">🗂️</span>
          <div class="lineage-text">
            <strong>{{ $t('mint.batch.title') }}</strong>
            <span>{{ $t('mint.batch.summary', { n: mintCount }) }}</span>
          </div>
        </div>

        <!-- Lineage Indicator — the degenerate size-1 batch (today's
             single-mint UX, unchanged display, board-level XOR rule). -->
        <div v-else class="lineage-box" :class="singleCardParentId ? 'branch' : 'root'">
          <span class="lineage-icon">{{ singleCardParentId ? '↳' : '🌱' }}</span>
          <div class="lineage-text">
            <strong>{{ singleCardParentId ? $t('mint.lineage.branch') : $t('mint.lineage.root') }}</strong>
            <span v-if="singleCardParentId">{{ $t('mint.lineage.derivedFrom', { id: singleCardParentId }) }}</span>
            <span v-else>{{ $t('mint.lineage.newOrigin') }}</span>
          </div>
        </div>

        <!-- card-position-annotations Stage A: duplicate-position notice.
             Warning, not a hard block (C10 posture) — the user may
             proceed deliberately (e.g. a second card with different
             grading params over the same position). C6: the in-flight
             lookup renders as "checking", never as a silent
             no-duplicate-found. Single-card only — `open()` only fires
             `checkDuplicate` when `mintNodeIds.size === 1` (a batch of
             N has N positions to check, out of this build's scope). -->
        <div v-if="isSingleCard && duplicateCheckStatus === 'checking'" class="duplicate-notice duplicate-checking">
          {{ $t('mint.duplicateCheck.checking') }}
        </div>
        <div v-else-if="isSingleCard && duplicateCardId !== null" class="duplicate-notice duplicate-warning">
          {{ $t('mint.duplicateCheck.warning', { id: duplicateCardId }) }}
        </div>

        <!-- Basic Settings -->
        <div class="form-grid">
          <label>{{ $t('mint.field.targetMoves') }}</label>
          <input type="number" v-model.number="draft.num_moves" min="1" max="50" class="dark-input" />

          <label>{{ $t('mint.field.defaultVisits') }}</label>
          <!-- 34b: visits live inside `grading_parameter.data.default_visits`,
               not at the top level. The OpenAPI-generated wire type leaves
               that path opaque (`{[key: string]: unknown}`); the typed
               accessor `defaultVisits` (see <script>) widens at the
               access boundary. The path is guaranteed to exist because
               `open()`'s `compileMintGradingParameter` call constructs
               it before the modal renders. -->
          <input type="number" v-model.number="defaultVisits" min="1" step="100" class="dark-input" />

          <label>{{ $t('mint.field.discountGamma') }}</label>
          <!-- gamma rides in `grading_parameter.data.gamma` alongside
               default_visits; same opacity story, same typed-accessor
               pattern (see <script>). Range bounded to (0, 1] —
               Ebisu's recall-discount semantics. -->
          <input type="number" v-model.number="gamma" min="0.01" max="1" step="0.01" class="dark-input" />

          <label>{{ $t('mint.field.analysisPalette') }}</label>
          <select v-model="selectedPaletteId" class="dark-select">
            <option value="active">{{ $t('mint.palette.activeOption') }}</option>
            <option v-for="p in palettes" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>

          <!-- Komi calibration (opt-in, pedagogical). Shown only when an
               engine is connected — commissioner ruling (ledger row
               1063): calibration is a BATCH-WIDE option, applied per
               card, each card evaluated at its OWN position
               (`submit()`'s per-card loop) — no longer gated to a
               single-card selection. The visits input is enabled only
               when the checkbox is checked; its value is per-mint and
               does not write back to the `engine.katago.calibrationVisits`
               setting. -->
          <template v-if="engineConnected">
            <label>{{ $t('mint.field.calibrateKomi') }}</label>
            <label class="checkbox-cell">
              <input type="checkbox" v-model="calibrateKomi" class="calibrate-checkbox" />
              <span class="hint">{{ $t('mint.komiCalibration.hint') }}</span>
            </label>

            <label>{{ $t('mint.field.calibrationVisits') }}</label>
            <input
              type="number"
              v-model.number="calibrationVisits"
              min="1"
              step="100"
              class="dark-input"
              :disabled="!calibrateKomi"
            />
          </template>
        </div>

        <!-- Tag Autocomplete -->
        <div class="form-group" style="margin-top: var(--space-medium);">
          <label class="tag-label">{{ $t('mint.field.tags') }}</label>
          <div class="tag-input-wrapper">
            <div class="tag-badges">
              <span v-for="(tag, i) in draft.tags" :key="tag" class="tag-badge">
                {{ tag }}
                <button class="tag-remove" @click="removeTag(i)">×</button>
              </span>
            </div>

            <input
              type="text"
              class="tag-input"
              v-model="tagInput"
              :placeholder="$t('mint.tags.placeholder')"
              @keydown="handleTagKeydown"
              @focus="showSuggestions = true"
              @blur="hideSuggestionsDelayed"
            />

            <!-- Dropdown -->
            <ul v-if="showSuggestions && filteredTags.length > 0" class="suggestions-list">
              <li v-for="sugg in filteredTags" :key="sugg" @mousedown.prevent="addTag(sugg)">
                {{ sugg }}
              </li>
            </ul>
          </div>
          <p class="hint">{{ $t('mint.tags.hint') }}</p>
        </div>

      </div>

      <div class="modal-footer">
        <button class="btn-cancel" @click="close" :disabled="isLoading">{{ $t('mint.button.cancel') }}</button>
        <button class="btn-submit" @click="submit" :disabled="isLoading">
          {{ isLoading ? $t('mint.button.minting') : $t('mint.button.mint') }}
        </button>
      </div>

    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
  background: rgba(0, 0, 0, 0.1);
  display: flex; align-items: center; justify-content: center; z-index: var(--z-modal);
}

/* magic-literal: 420px modal width — same design decision as
   ConfirmLoadModal.vue. Modal-width substrate not pursued (3 sites,
   2 widths is a thin cluster). */
.modal-content {
  background: var(--surface-0); border: 1px solid var(--border-2); border-radius: var(--radius-default);
  width: 420px; max-width: 90vw; box-shadow: 0 10px 30px rgba(0,0,0,0.8);
  display: flex; flex-direction: column; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

.modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: var(--space-medium) var(--space-medium); border-bottom: 1px solid var(--surface-3); background: var(--surface-2);
}
.modal-header h2 { margin: 0; font-size: var(--text-heading); color: var(--text-0); text-transform: uppercase; letter-spacing: var(--tracking-tight); }
.close-btn { background: none; border: none; color: var(--text-2); font-size: var(--text-heading); cursor: pointer; }

.modal-body { padding: var(--space-medium); }

.lineage-box {
  display: flex; align-items: center; gap: var(--space-medium); padding: var(--space-medium);
  border-radius: var(--radius-default); margin-bottom: var(--space-medium); border: 1px solid transparent;
}
.lineage-box.root { background: color-mix(in srgb, var(--state-success) 10%, transparent); border-color: color-mix(in srgb, var(--state-success) 30%, transparent); }
.lineage-box.branch { background: color-mix(in srgb, var(--accent-primary) 10%, transparent); border-color: color-mix(in srgb, var(--accent-primary) 30%, transparent); }
.lineage-icon { font-size: var(--text-heading); }
.lineage-text { display: flex; flex-direction: column; font-size: var(--text-emphasis); color: var(--text-1); }
.lineage-text strong { color: var(--text-0); font-size: var(--text-emphasis); text-transform: uppercase; }

/* card-position-annotations Stage A: duplicate-position notice. A
   distinct border/background per genre convention (ADR-0019) rather
   than color-only (C18) — the text itself names the condition, the
   color is a secondary reinforcement, not the sole signal. */
.duplicate-notice {
  padding: var(--space-default) var(--space-medium);
  border-radius: var(--radius-default);
  margin-bottom: var(--space-medium);
  border: 1px solid transparent;
  font-size: var(--text-emphasis);
}
.duplicate-checking {
  color: var(--text-2);
  background: color-mix(in srgb, var(--text-2) 8%, transparent);
  border-color: color-mix(in srgb, var(--text-2) 20%, transparent);
}
.duplicate-warning {
  color: var(--text-0);
  background: color-mix(in srgb, var(--state-warning) 12%, transparent);
  border-color: color-mix(in srgb, var(--state-warning) 40%, transparent);
}

.form-grid { display: grid; grid-template-columns: 110px 1fr; gap: var(--space-medium); align-items: center; }
.form-grid label { font-size: var(--text-emphasis); color: var(--text-2); text-transform: uppercase; }
.dark-input {
  background: var(--surface-0); border: 1px solid var(--border-2); color: var(--text-0); padding: var(--space-default);
  border-radius: var(--radius-default); font-family: monospace; font-size: var(--text-emphasis); width: 100%; outline: none;
}
.dark-select {
  border: 1px solid var(--border-2); color: var(--text-0); padding: var(--space-default);
  border-radius: var(--radius-default); font-family: monospace; font-size: var(--text-emphasis); width: 100%; outline: none;
}
.dark-input:focus, .dark-select:focus { border-color: var(--accent-primary); }
.dark-input:disabled { opacity: var(--alpha-disabled); cursor: not-allowed; }

/* Calibration checkbox cell — a non-uppercased inline label so the
   checkbox sits next to its explanatory hint without inheriting the
   form-grid label's letter-spacing / uppercase transform. */
.checkbox-cell { display: flex; align-items: center; gap: var(--space-default); text-transform: none; }
.calibrate-checkbox { width: auto; accent-color: var(--accent-primary); cursor: pointer; }

.tag-label { font-size: var(--text-emphasis); color: var(--text-2); text-transform: uppercase; display: block; margin-bottom: var(--space-default); }
.tag-input-wrapper {
  background: var(--surface-0); border: 1px solid var(--border-2); border-radius: var(--radius-default);
  display: flex; flex-wrap: wrap; padding: var(--space-tight); gap: var(--space-tight); position: relative;
}
.tag-input-wrapper:focus-within { border-color: var(--accent-primary); }

.tag-badges { display: flex; flex-wrap: wrap; gap: var(--space-tight); }
.tag-badge {
  background: var(--border-1); color: var(--accent-primary); padding: 2px 6px; border-radius: var(--radius-default);
  font-size: var(--text-emphasis); font-family: monospace; display: flex; align-items: center; gap: var(--space-tight);
}
.tag-remove { background: none; border: none; color: var(--text-2); cursor: pointer; font-size: var(--text-emphasis); padding: 0; line-height: 1; }
.tag-remove:hover { color: var(--state-attention); }

.tag-input {
  background: transparent; border: none; color: var(--text-0); font-family: monospace;
  font-size: var(--text-emphasis); outline: none; flex: 1; min-width: 120px; padding: 2px;
}

.suggestions-list {
  position: absolute; top: 100%; left: 0; width: 100%; background: var(--surface-2);
  border: 1px solid var(--border-2); border-top: none; border-radius: 0 0 var(--radius-default) var(--radius-default);
  list-style: none; padding: 0; margin: 0; max-height: 150px; overflow-y: auto; z-index: var(--z-popover);
}
.suggestions-list li { padding: var(--space-default) var(--space-medium); font-size: var(--text-emphasis); font-family: monospace; color: var(--text-1); cursor: pointer; }
.suggestions-list li:hover { background: var(--border-1); color: var(--accent-primary); }

.hint { font-size: var(--text-body); color: var(--text-2); margin: var(--space-tight) 0 0 0; }

.modal-footer {
  display: flex; justify-content: flex-end; gap: var(--space-medium); padding: var(--space-medium) var(--space-medium);
  border-top: 1px solid var(--surface-3); background: var(--surface-2);
}
.btn-cancel { background: transparent; border: 1px solid var(--border-3); color: var(--text-1); padding: var(--space-default) var(--space-medium); border-radius: var(--radius-default); cursor: pointer; }
.btn-submit { background: var(--accent-primary); border: none; color: var(--surface-1); font-weight: bold; padding: var(--space-default) var(--space-medium); border-radius: var(--radius-default); cursor: pointer; }
.btn-submit:disabled { opacity: var(--alpha-disabled); cursor: not-allowed; }
</style>
