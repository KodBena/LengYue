/**
 * src/composables/useAppDialogs.ts
 *
 * Promise-based replacement for native `window.prompt` / `confirm` /
 * `alert` (ADR-0019 audit S14 — "17 native prompt()/confirm()/alert()
 * call sites... browser prompts are unstyled, unthemed, unvalidated,
 * not keyboard-configurable"). One cross-layer request signal, in the
 * same module-scoped-ref shape as `useSetupWizardSignal.ts` /
 * `useMintDialogSignal.ts` / `useModalKeyboard.ts`'s `openModalCount`
 * — a module-scoped `ref` exported read-only, mutated only through
 * named functions — plus a `resolve` callback carried on the request
 * itself so the two dialog components (`AppConfirmDialog.vue`,
 * `AppPromptDialog.vue`, mounted once at `App.vue` level) can settle
 * the caller's promise without a second signal channel.
 *
 * Only one request is live at a time — the `activeRequest` slot holds
 * at most one `ConfirmRequest | PromptRequest`, mirroring the app's
 * existing one-modal-at-a-time posture (no site in this sweep opens a
 * second dialog from within a first). A second call while one is
 * pending overwrites the slot; the app has no caller that does this
 * today, so surfacing it as a hard error would be over-engineering
 * ahead of a witnessed need.
 *
 * `alert()` is a `confirm()` whose `cancelLabel` is `null` — the
 * component pair renders a single OK button in that case rather than
 * a second, distinct dialog component (per commission: "alert = confirm
 * with single button").
 *
 * Cancellation always resolves rather than rejects (`false` / `null`),
 * and never mutates any state the caller already holds — every one of
 * the 17 converted call sites does its own `if (!name) return;` /
 * `if (!ok) return;` guard on the resolved value, so a cancelled
 * dialog is a no-op exactly like the native primitive it replaces
 * (C16: the caller's own draft, if any, is untouched by a cancel).
 *
 * License: Public Domain (The Unlicense)
 */

import { ref, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';

export interface ConfirmDialogOptions {
  readonly title?: string;
  readonly message: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  /** Styles the confirm button as destructive (C10 guard affordance). */
  readonly danger?: boolean;
}

export interface AlertDialogOptions {
  readonly title?: string;
  readonly message: string;
  readonly okLabel?: string;
}

export interface PromptDialogOptions {
  readonly title?: string;
  readonly message?: string;
  readonly defaultValue?: string;
  readonly placeholder?: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
}

export interface ConfirmRequest {
  readonly kind: 'confirm';
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
  /** `null` renders a single OK button — the alert() shape. */
  readonly cancelLabel: string | null;
  readonly danger: boolean;
  readonly resolve: (value: boolean) => void;
}

export interface PromptRequest {
  readonly kind: 'prompt';
  readonly title: string;
  readonly message: string;
  readonly defaultValue: string;
  readonly placeholder: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  readonly resolve: (value: string | null) => void;
}

export type DialogRequest = ConfirmRequest | PromptRequest | null;

const activeRequest: Ref<DialogRequest> = ref(null);

/** Read-only signal: `AppConfirmDialog` / `AppPromptDialog` render off this. */
export const currentDialogRequest: Readonly<Ref<DialogRequest>> = activeRequest;

/** Called by `AppConfirmDialog` on its OK / Cancel / Escape paths. */
export function settleConfirm(value: boolean): void {
  const req = activeRequest.value;
  if (req === null || req.kind !== 'confirm') return;
  activeRequest.value = null;
  req.resolve(value);
}

/** Called by `AppPromptDialog` on its OK / Cancel / Escape paths. */
export function settlePrompt(value: string | null): void {
  const req = activeRequest.value;
  if (req === null || req.kind !== 'prompt') return;
  activeRequest.value = null;
  req.resolve(value);
}

/**
 * In-app replacements for `window.confirm` / `alert` / `prompt`.
 * Called from a component's `<script setup>` (uses `useI18n()` for
 * the default button labels), so every call site keeps the
 * `useI18n()` + `t()` pattern it already had.
 */
export function useAppDialogs() {
  const { t } = useI18n();

  function confirm(options: ConfirmDialogOptions): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      activeRequest.value = {
        kind: 'confirm',
        title: options.title ?? '',
        message: options.message,
        confirmLabel: options.confirmLabel ?? t('dialogs.confirm.defaultConfirm'),
        cancelLabel: options.cancelLabel ?? t('dialogs.confirm.defaultCancel'),
        danger: options.danger ?? false,
        resolve,
      };
    });
  }

  function alert(options: AlertDialogOptions): Promise<void> {
    return new Promise<void>((resolve) => {
      activeRequest.value = {
        kind: 'confirm',
        title: options.title ?? t('dialogs.alert.defaultTitle'),
        message: options.message,
        confirmLabel: options.okLabel ?? t('dialogs.alert.defaultOk'),
        cancelLabel: null,
        danger: false,
        resolve: () => resolve(),
      };
    });
  }

  function prompt(options: PromptDialogOptions): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      activeRequest.value = {
        kind: 'prompt',
        title: options.title ?? '',
        message: options.message ?? '',
        defaultValue: options.defaultValue ?? '',
        placeholder: options.placeholder ?? '',
        confirmLabel: options.confirmLabel ?? t('dialogs.prompt.defaultConfirm'),
        cancelLabel: options.cancelLabel ?? t('dialogs.prompt.defaultCancel'),
        resolve,
      };
    });
  }

  return { confirm, alert, prompt };
}
