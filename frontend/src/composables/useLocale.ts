/**
 * src/composables/useLocale.ts
 * Locale read/write composable. Wraps the GlobalStore's
 * `appearance.locale` field so consumers don't import the store
 * directly, and exposes the supported-locale registry plus the
 * display-name map for the picker UI.
 *
 * The composable owns no state of its own; it's a thin reactive
 * facade over the persisted setting. The runtime propagation
 * (writing through to vue-i18n's locale ref) is the
 * `useAppBootstrap` watch's job — keeps the wiring centralised
 * with the other appearance watches (theme, intensityHueShift)
 * and avoids fanning out the i18n dependency to every consumer
 * of the locale value.
 *
 * Public API:
 *   - locale: ComputedRef<SupportedLocale> — the current locale.
 *   - supportedLocales: readonly SupportedLocale[].
 *   - displayName: (loc: SupportedLocale) => string — the
 *     locale's name in its own script (English / 简体中文 / 日本語 / …).
 *   - flag: (loc: SupportedLocale) => string — regional-flag emoji
 *     for the picker UI.
 *   - isMachineTranslated: ComputedRef<boolean> — true when the
 *     active catalog is in MACHINE_TRANSLATED_LOCALES (the picker
 *     uses this to render a contribute-invitation notice).
 *   - setLocale(loc): mutator. Writes through to the store; the
 *     useAppBootstrap watch picks it up and flips i18n.global.locale.
 *
 * License: Public Domain (The Unlicense)
 */

import { computed } from 'vue';
import type { ComputedRef } from 'vue';

import { store } from '../store';
import {
  SUPPORTED_LOCALES,
  LOCALE_DISPLAY_NAMES,
  LOCALE_FLAGS,
  MACHINE_TRANSLATED_LOCALES,
  isSupportedLocale,
  DEFAULT_LOCALE,
} from '../i18n/locales';
import type { SupportedLocale } from '../i18n/locales';

export function useLocale(): {
  locale: ComputedRef<SupportedLocale>;
  supportedLocales: readonly SupportedLocale[];
  displayName: (loc: SupportedLocale) => string;
  flag: (loc: SupportedLocale) => string;
  isMachineTranslated: ComputedRef<boolean>;
  setLocale: (loc: SupportedLocale) => void;
} {
  // Defensive resolver per ADR-0002. The migration and the type
  // declaration both promise a SupportedLocale, but a hand-edited
  // workspace blob or a future code path that bypasses the migration
  // could land here with garbage. Falling through to vue-i18n's own
  // fallback chain would be silent; resolving explicitly here keeps
  // the resolution one read away in DevTools.
  const locale = computed<SupportedLocale>(() => {
    const raw = store.profile.settings.appearance.locale;
    return isSupportedLocale(raw) ? raw : DEFAULT_LOCALE;
  });

  const setLocale = (loc: SupportedLocale): void => {
    store.profile.settings.appearance.locale = loc;
  };

  const displayName = (loc: SupportedLocale): string =>
    LOCALE_DISPLAY_NAMES[loc];

  const flag = (loc: SupportedLocale): string =>
    LOCALE_FLAGS[loc];

  const isMachineTranslated = computed<boolean>(() =>
    MACHINE_TRANSLATED_LOCALES.has(locale.value)
  );

  return {
    locale,
    supportedLocales: SUPPORTED_LOCALES,
    displayName,
    flag,
    isMachineTranslated,
    setLocale,
  };
}
