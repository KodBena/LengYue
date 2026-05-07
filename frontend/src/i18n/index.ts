/**
 * src/i18n/index.ts
 * vue-i18n plugin instance for the SPA. Owns the createI18n
 * configuration; bundled-catalog message loading; cold-start
 * locale resolution.
 *
 * ── Why bundled, not lazy ─────────────────────────────────────────
 * Active-roster payload at full sweep is on the order of 50–60 KB
 * minified (en is the only fully-populated catalog; the CJK trio
 * ships as `{}` until native-speaker review). Lazy loading would
 * add a Promise round-trip on every locale switch and a Suspense-
 * or-loader concern in every consumer. The payload fits the
 * budget; bundling keeps the consumer surface synchronous
 * (`$t('key')` resolves immediately, no awaits, no loading
 * states). If active catalogs balloon past ~500 KB total, revisit.
 *
 * ── Cold-start locale ────────────────────────────────────────────
 * The plugin initialises with DEFAULT_LOCALE (`en`). The actual
 * active locale is propagated by `useAppBootstrap`'s watch on
 * `store.profile.settings.appearance.locale` (immediate: true),
 * which flips the i18n.global.locale ref to whatever the
 * (post-hydration or default) workspace blob says. The plugin's
 * own initial value is just the safe fallback for the brief window
 * before the watch fires.
 *
 * ── Composition API mode ─────────────────────────────────────────
 * `legacy: false` opts into the Composition API (`useI18n()`
 * returns refs). The Options-API surface (`this.$t`) is also
 * available in templates, which is what most consumer SFCs will
 * use for the bulk of the string sweep — the Composition surface
 * is reserved for composables that need to react to locale
 * changes programmatically.
 *
 * License: Public Domain (The Unlicense)
 */

import { createI18n } from 'vue-i18n';

import { DEFAULT_LOCALE } from './locales';
import type { SupportedLocale } from './locales';

import en    from '../locales/en.json';
import zhCN  from '../locales/zh-CN.json';
import ja    from '../locales/ja.json';
import ko    from '../locales/ko.json';

type Catalog = Record<string, string>;

const messages: Record<SupportedLocale, Catalog> = {
  'en':    en,
  'zh-CN': zhCN,
  'ja':    ja,
  'ko':    ko,
};

export const i18n = createI18n({
  legacy: false,
  // Even with `legacy: false`, expose `$t` / `$tc` on the template
  // context. Most consumer SFCs reach for the template-level helper
  // for the bulk of the string sweep; the Composition surface
  // (`useI18n()`) is reserved for composables that need to react to
  // locale changes programmatically. Default is `true` in v9+ but
  // declared explicitly so a future flip in vue-i18n's defaults
  // doesn't silently break templates.
  globalInjection: true,
  locale: DEFAULT_LOCALE,
  fallbackLocale: 'en',
  messages,
  // ADR-0002: surface missing translations rather than swallowing
  // them. `missingWarn` and `fallbackWarn` keep the dev console
  // loud about catalog drift; production builds (NODE_ENV=production)
  // suppress these per vue-i18n's own convention so end users don't
  // see plumbing noise. The warnings name the missing key — exactly
  // the affordance the lockstep audit posture (per i18n-plan.md)
  // depends on.
  missingWarn: true,
  fallbackWarn: true,
});
