/**
 * src/i18n/locales.ts
 * Supported-locale registry and browser-detection helper for the
 * SPA's vue-i18n integration.
 *
 * The supported list is the project's policy decision (see
 * docs/archive/notes/i18n-plan.md): English source, plus Simplified
 * Chinese / Japanese / Korean for the Go-research target audience.
 * Adding a locale is a four-site change here: extend
 * SUPPORTED_LOCALES below, add entries to LOCALE_DISPLAY_NAMES and
 * LOCALE_FLAGS, add a prefix branch to detectBrowserLocale; then
 * add the JSON catalog under src/locales/ and register it in
 * src/i18n/index.ts's messages map. The RegistryEditor's
 * `appearance.locale` enum and the toolbar `LocalePicker` both read
 * SUPPORTED_LOCALES at render time, so they pick up new entries
 * automatically.
 *
 * Browser detection runs once during the schema 23 → 24
 * migration to backfill existing users' workspace blobs; it also
 * runs at composable-initialisation time as a defensive fallback
 * if the persisted value is somehow outside the supported set
 * (per ADR-0002, an unsupported value would otherwise silently
 * default through vue-i18n's own fallback chain — explicit
 * resolution here keeps the resolution loud and inspectable).
 *
 * License: Public Domain (The Unlicense)
 */

export const SUPPORTED_LOCALES = ['en', 'zh-CN', 'ja', 'ko'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/**
 * Display names for each supported locale, in their own script.
 * Rendered by the locale picker (and the Settings-tab proof-of-life
 * label in PR1). Kept here rather than in the per-locale catalogs
 * because the picker shows ALL locales' names side-by-side regardless
 * of which one is active — they're metadata about locales, not
 * translations within them.
 */
export const LOCALE_DISPLAY_NAMES: Record<SupportedLocale, string> = {
  'en':    'English',
  'zh-CN': '简体中文',
  'ja':    '日本語',
  'ko':    '한국어',
};

/**
 * Regional-flag emoji for each supported locale, used by the toolbar
 * locale picker. Kept alongside the display-name map so adding a
 * locale stays a single-file registry edit on this side.
 *
 * `en` is rendered as the UK flag — the project's writing style leans
 * British (`analyse`, `colour`, `tokenised`) and the locale code
 * doesn't carry a region suffix, so 🇬🇧 is the closer-fit visual
 * anchor than 🇺🇸. When `en-US` ships as a separate locale (no
 * concrete plan), pick 🇺🇸 there and revisit this default.
 */
export const LOCALE_FLAGS: Record<SupportedLocale, string> = {
  'en':    '🇬🇧',
  'zh-CN': '🇨🇳',
  'ja':    '🇯🇵',
  'ko':    '🇰🇷',
};

/**
 * Locales whose catalogs were produced by machine translation and
 * have not yet had a native-speaker review pass. The toolbar
 * `LocalePicker` reads this set and renders a per-locale notice
 * inviting contributions when one of these is active. When a
 * native reviewer ratifies a catalog, remove its entry here.
 *
 * The notice text itself lives in each affected catalog under
 * `localePicker.machineTranslatedNotice` (rendered) and
 * `localePicker.machineTranslatedTooltip` (hover detail), so the
 * invitation reads in the user's own language.
 */
export const MACHINE_TRANSLATED_LOCALES: ReadonlySet<SupportedLocale> =
  new Set(['zh-CN', 'ja', 'ko']);

export const DEFAULT_LOCALE: SupportedLocale = 'en';

/**
 * Type guard. Used at the migration boundary and at the composable's
 * cold-start defensive resolution.
 */
export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string'
    // widen the literal-union tuple to string[] so .includes accepts an
    // arbitrary string (the guard narrows `value` to SupportedLocale on true).
    && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * Resolve the user-agent's preferred locale to a SupportedLocale.
 * Strategy: walk navigator.languages in order, applying a sequence
 * of matchers — exact match first, then language-only prefix
 * (`zh-Hans-HK` → `zh-CN`). Falls back to DEFAULT_LOCALE if no
 * match is found.
 *
 * The prefix-mapping rules are conservative:
 *   - `zh*` → `zh-CN` (Simplified is the project's only Chinese
 *     catalog; Traditional users land on Simplified rather than
 *     fallback English, which is the closer-fit choice. When
 *     `zh-TW` ships, refine this).
 *   - any other 2-letter prefix matches its same-prefix supported
 *     locale exactly (`en-GB` → `en`, `ja-JP` → `ja`).
 *
 * Per ADR-0002, no silent coercion of garbage input — a
 * navigator.languages entry that doesn't parse is skipped, not
 * coerced into something arbitrary.
 */
export function detectBrowserLocale(): SupportedLocale {
  // navigator.languages is the modern surface; navigator.language is
  // the single-string fallback for older / restricted environments.
  // Both are read defensively to keep this helper SSR-safe (the SPA
  // doesn't SSR today, but the helper has no Vue dependencies and
  // could be imported into a future SSR path).
  const candidates: string[] =
    typeof navigator === 'undefined'
      ? []
      : (navigator.languages?.length
          ? Array.from(navigator.languages)
          : navigator.language
            ? [navigator.language]
            : []);

  for (const raw of candidates) {
    if (typeof raw !== 'string' || raw.length === 0) continue;

    // Exact match — `en`, `zh-CN`, `ja`, `ko`.
    if (isSupportedLocale(raw)) return raw;

    // Language-only prefix dispatch.
    const prefix = raw.split('-')[0]?.toLowerCase();
    if (!prefix) continue;
    if (prefix === 'zh') return 'zh-CN';
    if (prefix === 'en') return 'en';
    if (prefix === 'ja') return 'ja';
    if (prefix === 'ko') return 'ko';
  }

  return DEFAULT_LOCALE;
}
