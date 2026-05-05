# Internationalization (i18n) — Scoping

A scoping note for translating LengYue's UI to additional locales.
Not a current-priority feature; filed for future implementation so
a contributor can pick it up without re-deriving the bands.

## Status

**Scoping.** No implementation planned. The design space is sketched
here; the TODO entry under "Future projects" references this note.

## Why care, why not now

Every other Go GUI on the market ships with locale options, and the
target audience (serious Go researchers) skews international —
Chinese, Japanese, and Korean are the obvious candidates given the
game's strongholds. The mechanical work is well-defined once scoped.

Why not a current priority: the project is single-author, the
post-v1 distribution-packaging arc is the leading edge, and i18n
adds maintenance overhead (strings must stay in lockstep across
locales — the same trap that caught us on PV-animation defaults)
without unlocking new capability.

## String inventory (rough count, 2026-05)

A grep over `frontend/src/` produces order-of-magnitude **150-300
distinct user-facing strings** — well above the "less than 20"
intuition that initially scoped this question. Categories:

| Category                              | Approx. count | Notes                                                          |
|---------------------------------------|---------------|----------------------------------------------------------------|
| `title=` attributes                   | ~30           | Tooltips on buttons, indicators, controls.                     |
| `placeholder=` attributes             | 5             | Form inputs (login, search).                                   |
| `aria-label=` attributes              | 2             | Accessibility hints.                                           |
| `pushSystemMessage(...)` calls        | 43            | Toasts; many wrap interpolated `${msg}` from `err.message`.    |
| Native `alert / confirm / prompt`     | 4             | The qEUBO pin name prompt and similar.                         |
| Inline template text                  | ~50-100       | Button labels, tab names, modal headers, empty states.         |

These are unique strings (deduplicated where the grep can see it).
Total *call sites* is larger because some strings recur across
components.

## Bands (per ADR-0003 mental model)

**What gets translated:**

- **Band 1 — domain-agnostic UI chrome.** Button labels, tab names,
  modal headers, system messages, settings labels, tooltips, form
  placeholders. The bulk of the work and the natural starting
  point.
- **Band 2 — game-tree-coupled UI text.** "Move N", "Branch",
  "Variation", "Pass", "Resign". Translatable; small in count.

**What does NOT get translated:**

- **DSL symbol names** (`quality_delta`, `decisiveness`,
  `visit_ratio`, `complexity`, `winrate`). Referenced by string
  in palette configurations and the `analysis_env.symbols`
  registry; translating would break palette portability across
  locales. These are user-extensible identifiers, not display
  text.
- **Wire-shape field names** (snake_case from the backend or
  proxy). Protocol vocabulary, never user-facing.
- **Console / debug log lines** — the umbrella handoff names
  these as intentionally English; the target user is technical
  and benefits from grep-stable English logs.
- **KataGo's output** — move notation (`Q16`, `pass`), coordinate
  systems, raw win-rate / score numerics. Invariant under
  language.
- **File-format vocabulary** — SGF property tags (`B`, `W`, `AB`,
  `AW`, `RU`, `KM`), ruleset names where the file format defines
  them. Translating would break interop.
- **Built-in palette IDs** (`default`, `quality`, `score`,
  `rank`). User-visible palette *names* are translatable; the
  IDs are stable handles in persistence.
- **User-authored content** (card descriptions, palette overrides,
  bookmark names). Lives in the user's own locale by definition.

## Tooling

`vue-i18n` is the natural pick. Plugs into Vue 3 cleanly, gives
`t('key')` in scripts and `$t('key')` in templates, supports
per-locale JSON catalogs, lazy-loading, pluralization, and
number/date formatting. ~100KB minified — acceptable for this
project's bundle target.

Alternatives considered: hand-rolled lookup table (rejected —
loses pluralization and the broader ecosystem), `formatjs` (more
feature-complete but heavier; not justified at this scale).

## Outstanding decisions (must precede implementation)

- **Which locales?** English is the source. Beyond that, the
  obvious candidates are Chinese (Simplified and/or Traditional),
  Japanese, and Korean given the Go-playing populations. Each
  adds maintenance load — the project should not commit to more
  locales than it can keep current.
- **Translation workflow.** Three options: community
  contributions (PR-driven, slow but free), LLM-assisted (fast
  but needs review), paid (best quality, costs money). The
  mechanical i18n work is identical; the quality-control loop
  differs.
- **Key-naming convention.** `feature.subfeature.element` is
  standard (`qeubo.toolbar.applied`, `cards.modal.mint.title`).
  Pick once; renaming keys later is mechanical but produces
  noisy PRs.
- **Lockstep handling.** Same trap as the PV-animation defaults
  (three sites that must agree). Multi-source strings — error
  messages duplicated across `catch` blocks, hardcoded fallbacks
  in `try` paths — need a discipline. Either factor commons to
  constants (with i18n keys), or accept the duplication and
  audit periodically.
- **Backend error message handling.** The backend emits English
  error strings; many `pushSystemMessage` calls wrap them
  (`qEUBO verdict failed: ${msg}`). Three approaches:
  - (a) Frontend translates only the wrapper, passes through
    the English `${msg}`. Half-done but cheap to ship.
  - (b) Backend emits structured error codes; frontend translates
    each. Requires a backend-side dispatch and a code registry.
  - (c) Backend gains its own i18n layer. Out of scope for a
    frontend-only effort.
  Recommend (a) initially with (b) as the upgrade path when
  enough error sites accumulate to justify it.
- **Right-to-left support.** Arabic, Hebrew. Affects layout
  (mirrored flexbox, icon orientation, scroll direction), not
  just strings. Out of scope for v1 i18n; flag if a contributor
  wants to take it on as a separate arc.
- **Locale persistence.** Per-user setting in `GlobalStore`, or
  browser-detection-only? Per-user gives identity-aware locale
  preference (good for shared machines / multi-tenant
  deployments); browser-detection is simpler. Probably both —
  detect at first run, store in the user's profile thereafter.

## Definition of done (scoping arc)

- This document ratified.
- TODO entry under "Future projects" referencing it.
- Outstanding decisions either resolved or explicitly deferred
  to the implementation arc.

## Definition of done (implementation arc)

- `vue-i18n` wired in; English catalog at `src/locales/en.json`
  (or equivalent path).
- All Band 1 strings extracted to keys; no remaining hardcoded
  user-facing English in `src/components/`, `src/composables/`,
  or `src/services/` tooltips and system messages.
- At least one additional locale's catalog populated and verified
  end-to-end (a native-speaker review of the catalog before
  merge).
- A `frontend/docs/i18n.md` (or similar) documenting the
  contributor workflow: adding a string adds an English key + an
  entry in `en.json`; the contributor flags the locales as
  needing translation; a maintainer or community contributor
  fills the gap.
- The lockstep discipline named above is encoded — either as
  comments at the lockstep sites or as a lint check.

## Triggers — when to actually start

The work is opt-in for the project. Reasonable triggers:

- A community contributor offers a pilot locale's catalog and
  signals willingness to maintain it.
- Distribution packaging ships and the next wave of users is
  predominantly non-English-speaking.
- The UI surface stabilizes enough that key churn is bounded
  (currently true post-v1.0.0; the cluster-theme arc and the
  qEUBO toolbar are the most recent UI moves).

Not triggered by: the maintainer wanting it for its own sake,
unless the maintainer is also willing to either translate or
solicit translations.
