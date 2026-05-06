/**
 * docs/worklog/2026-05-06-i18n-pr1-plumbing.md
 * Worklog — i18n PR1 plumbing. vue-i18n wired into the SPA;
 * appearance.locale field on AppSettings with schema 23 → 24
 * browser-detection backfill; five locale catalogs scaffolded;
 * useLocale composable; contributor doc.
 * License: Public Domain (The Unlicense).
 */

# i18n PR1 — plumbing

- **Status:** Shipped on `frontend/i18n-pr1-plumbing`, 2026-05-06.
  Build green (`npm run build`); `npm install` adds vue-i18n@^11.
  Promotes the i18n entry from "Future projects" to Active Medium
  per the close-out's TODO move.
- **Genre:** Multi-PR arc opener. PR1 is pure plumbing — no
  string sweep yet. The proof-of-life line in the Settings tab
  verifies the catalog round-trip end-to-end (English ↔ Svenska
  flips immediately when the user picks via Advanced Registry →
  appearance → locale).
- **Date:** 2026-05-06.

## Why now

The scoping note (`docs/notes/i18n-plan.md`) had been ratified
since the v1 close-out but parked under Future projects waiting
on a trigger. The user opened the session asking to "continue
work on i18n," which after orientation resolved to: promote from
scoping to implementation. PR1's scope was negotiated up-front:
plumbing only, one stub key as the proof-of-life, no string
sweep until the plumbing is verified.

## Decisions resolved

The scoping note named seven outstanding decisions that had to
precede implementation. All seven settled during this session's
opening exchange:

| Decision | Resolution |
|---|---|
| **Locale roster** | `en` (source), `sv` (pilot), `zh-CN`, `ja`, `ko`. User picked Swedish as the verification pilot ("the only language I can actually read except for English"). |
| **Simplified vs Traditional Chinese** | Simplified (`zh-CN`). Pragmatic call: mainland China is the dominant Go-playing population; domestic platforms (Yike Weiqi, Tencent Weiqi) ship Simplified UI; Simplified → Traditional is a cheap machine conversion (OpenCC) so adding `zh-TW` later doesn't require redoing the work. |
| **Backend error messages** | (a) Pass-through. The wrapper translates; the interpolated `${err.message}` stays in English. Defer (b) backend-side error codes until enough sites accumulate to justify the dispatch. |
| **Locale persistence** | Per-user setting at `store.profile.settings.appearance.locale` — co-located with `theme` because both are presentation choices that hydrate identically. Browser-detect *once* during the migration that introduces the field; persisted thereafter. |
| **Key naming** | `feature.subfeature.element`, dot-namespaced flat. |
| **Lockstep posture** | Audit periodically rather than enforce at lint time. Tighten if duplicated error strings start drifting. |
| **RTL** | Out of scope for v1. Mirrored layout is its own arc. |

## What ships

Eight files touched, three new modules, two existing files
modified for plumbing, three doc-graph updates, one proof-of-life
SFC change.

### `src/i18n/locales.ts` — new file

`SUPPORTED_LOCALES` const tuple, `SupportedLocale` derived literal
union, `LOCALE_DISPLAY_NAMES` map (each locale's name in its own
script — `English` / `Svenska` / `简体中文` / `日本語` / `한국어`),
`isSupportedLocale` type guard, `detectBrowserLocale()` resolver.

The detector walks `navigator.languages` in order, applying
exact-match first then a small set of language-prefix dispatch
rules — `zh*` → `zh-CN` (Simplified is the only Chinese catalog
shipping; Traditional users land on Simplified rather than
fallback English, the closer-fit choice; refine when `zh-TW`
ships). SSR-safe (no Vue dependencies, defensive against
`navigator` being undefined). Per ADR-0002, garbage input is
skipped rather than coerced.

### `src/i18n/index.ts` — new file

`createI18n` configuration. `legacy: false` opts into the
Composition API (`useI18n()` returns refs); `globalInjection:
true` keeps `$t` available on the template context for the bulk
of the upcoming sweep. All five catalogs bundled — total payload
on the order of 200 KB at full sweep, fits the bundle budget,
keeps consumer surface synchronous (no Promise / Suspense dance
on locale switch). `missingWarn` and `fallbackWarn` are explicit
to honor ADR-0002's loud-failure tenet during dev.

Cold-start locale is `DEFAULT_LOCALE` (`en`); the actual active
locale is propagated by `useAppBootstrap`'s watch on
`store.profile.settings.appearance.locale` (`immediate: true`),
which flips `i18n.global.locale.value` once Vue mounts.

### `src/locales/{en,sv,zh-CN,ja,ko}.json` — five new catalog files

Each carries two stub keys for the proof-of-life:

- `meta.localeName` — the locale's name in its own script,
  duplicated from `LOCALE_DISPLAY_NAMES` (the picker UI uses
  the map; consumer SFCs get the catalog-resolved version).
- `meta.localeStatus` — interpolation demo:
  `"Active locale: {name}"` / `"Aktivt språk: {name}"` / etc.
  Verifies the `{placeholder}` machinery works end-to-end.

The non-Latin catalogs use the locale's native script for the
status string — confirms the build pipeline handles UTF-8
catalogs correctly (it does; vue-i18n + Vite's JSON loader handle
this transparently).

### `src/types.ts` — AppSettings.appearance.locale field

Added `locale: SupportedLocale` to `AppSettings.appearance`,
co-located with `theme`. Re-exports `SupportedLocale` from
`./i18n/locales` so consumers of the AppSettings shape don't
need a second import path. The field's docstring names the
schema-version-24 introduction, the SUPPORTED_LOCALES SSOT
location, and the add-a-locale procedure.

### `src/store/defaults.ts` — defaultSettings.appearance.locale: 'en'

Fresh-install default. Existing users get their browser-detected
locale via the migration (see below); new fresh installs land
predictably on English regardless of browser locale, with the
user able to flip via the RegistryEditor dropdown. The bias was
toward predictable defaults rather than silent locale-shifting at
install time — if new-install browser-detection turns out to
matter, add it at composable cold-start.

### `src/store/migrations.ts` — schema 23 → 24

Single migration: backfills `appearance.locale` for legacy blobs
via `detectBrowserLocale()`. Idempotent — pre-existing valid
SupportedLocale value preserved (a hand-edited blob isn't
clobbered); missing or unsupported value gets the
browser-detected one. Bumps `CURRENT_SCHEMA_VERSION` to 23.

The migration is the natural place for the one-time browser
detection: it fires exactly once per workspace blob (subsequent
loads see the persisted value and skip detection). Matches the
plan's "browser-detect at first run, store in user's profile
thereafter."

### `src/components/RegistryEditor.vue` — appearance.locale enum

One-line addition to `PATH_ENUMS`:
`'appearance.locale': [...SUPPORTED_LOCALES]`. The RegistryEditor
auto-renders the locale field as a dropdown picker (same shape as
the existing `appearance.theme` dropdown). No custom switcher
component needed in PR1 — the registry surface is the user's
locale picker until a chrome-level switcher earns its keep
during the sweep.

### `src/composables/useLocale.ts` — new composable

Thin reactive facade over `store.profile.settings.appearance.locale`.
Public API: `locale` (computed), `supportedLocales` (the const
tuple), `displayName(loc)` (LOCALE_DISPLAY_NAMES lookup),
`setLocale(loc)` (write-through). The defensive resolver inside
the `locale` computed catches out-of-set values (per ADR-0002 —
falling through to vue-i18n's silent fallback would hide the
bad value); the store-side value is left untouched, surfacing
the divergence to DevTools.

The runtime propagation (writing through to vue-i18n's locale
ref) is `useAppBootstrap`'s job rather than the composable's —
keeps the i18n dependency centralised with the other appearance
watches (theme, intensityHueShift), avoids fanning out the i18n
import to every consumer of the locale value.

### `src/composables/useAppBootstrap.ts` — locale watcher

New `watch` on `store.profile.settings.appearance.locale`,
`immediate: true`, mirroring the theme watcher's shape exactly.
Side-effects: writes through to `i18n.global.locale.value` and
sets `<html lang="...">` for assistive tech / browser language
inference. Defensive resolver via `isSupportedLocale` —
out-of-set values fall back to `DEFAULT_LOCALE` rather than
letting vue-i18n's silent chain hide the value.

### `src/main.ts` — app.use(i18n)

Two lines (import + `app.use(i18n)`). Plugin attaches before the
`errorHandler` config so error-handler messages routing through
`pushSystemMessage` could in principle resolve `$t` — though that
path remains English-pre-sweep and PR1 doesn't touch it.

### `src/App.vue` — proof-of-life line

One `<p>` element in the Advanced Registry section's open-state:
`{{ $t('meta.localeStatus', { name: $t('meta.localeName') }) }}`.
Renders "Active locale: English" / "Aktivt språk: Svenska" / etc.
in italic muted text. The retirement trigger is named in the
template-side comment: removed once the string sweep starts
producing real localized UI text — by then every label is its own
proof of life.

CSS class `.i18n-proof-of-life` added to the `<style>` block;
italic + `text-2` color, intentionally unobtrusive. Net SFC growth
~20 lines (template + style).

### `frontend/docs/i18n.md` — new contributor doc

Per the plan's definition-of-done. Documents:

- The supported-locale table and per-locale status (en active /
  sv pilot / zh-CN, ja, ko stubs).
- The four-step add-a-string workflow (key, en.json, other
  catalogs, SFC usage).
- The "what does NOT get translated" inventory (mirrored from
  the plan).
- The backend-error pass-through approach with worked example.
- The lockstep audit posture.
- The five-step add-a-locale procedure.
- The locale persistence model (per-user store field, one-time
  browser detection, defaults posture).

### Doc-graph updates

- **`docs/notes/i18n-plan.md`** — Status flips from "Scoping" to
  "Implementation in progress" with a pointer to this worklog.
  The seven outstanding decisions named in the plan are updated
  with the resolutions they got during PR1 scoping.
- **`docs/TODO.md`** — i18n entry moves from "Future projects"
  to "Active Medium." The new entry names PR1 as shipped, the
  remaining sweep work (categorised by string-source class), the
  per-locale completion model, and the explicit out-of-scope
  inventory.

## Verification

- `npm run build` (`vue-tsc -b && vite build`) green. Bundle size
  grew ~70 KB minified (~25 KB gzipped) for vue-i18n + the five
  catalogs at their currently-trivial size; comfortably within
  the existing budget.
- HMR smoke (deferred to user's session):
  - Open Settings → Advanced Registry → expand `appearance` →
    flip the `locale` dropdown.
  - Observe the proof-of-life line in italic above the registry
    flips ("Active locale: English" → "Aktivt språk: Svenska" →
    "当前语言：简体中文" → "現在の言語：日本語" → "현재 언어: 한국어").
  - Reload the page; the locale persists (round-trip through
    the backend's user_workspace_01 document is intact).
  - Hand-edit `localStorage` or trigger a stale workspace blob —
    the migration browser-detects on next hydrate.

## Out of scope (deliberate)

- **String sweep.** PR1 is pure plumbing; the actual user-facing
  English strings move through catalog keys in PR2+, locale-by-
  feature for reviewability.
- **Native-speaker review of zh-CN / ja / ko stubs.** Each
  locale's catalog ships with placeholder content; the
  per-locale activation gate is a separate dispatch when a
  reviewer steps forward.
- **A chrome-level locale picker component.** The RegistryEditor
  dropdown is the user's locale picker until a more discoverable
  surface (sidebar widget, settings-tab section) earns its keep
  during the sweep.
- **Backend error codes.** Wrapped errors stay pass-through per
  the (a) approach. A future dispatch upgrades to (b) once
  enough sites accumulate.
- **Lazy-loaded catalogs.** All five bundled. Lazy adds a
  Promise round-trip on every locale switch; catalog payload at
  full sweep fits the budget. Revisit if catalogs balloon past
  ~500 KB total.
- **RTL support.** Out of scope for v1 i18n per the plan; the
  mirrored-layout work is its own arc.

## License

Public Domain (The Unlicense).
