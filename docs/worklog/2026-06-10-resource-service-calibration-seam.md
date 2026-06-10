# Worklog — resource-service calibration seam inversion (2026-06-10)

> Audit trail for work-status item `resource-service-calibration-seam`,
> executing §3.18 of the SPA history-lessons audit
> (`docs/notes/audit/audit-spa-history-lessons-2026-06-10.md`). The
> Band-1 resource client's only public verb was Go-specific; this
> change inverts the seam so the generic verb is the public surface
> and the KataGo-calibration orchestration lives on the B3 side.

## The change

- **`services/resource-service.ts`** — the generic verb is now the
  module's public surface: `getResource<T>(name)` (the previously
  module-private `fetchResource<T>`, renamed per the item) is
  exported; the `ResourceService` class, its `resourceService`
  singleton, and the Go-specific `loadVisitDistribution` verb are
  removed, along with the module's import of the [B3] intensity
  factory. The file is now honestly domain-free, matching its [B1]
  tag. Header retrofitted with the standard license line (it was
  missing).
- **`composables/board/suggestion-color-calibration.ts` (new, [B3])**
  — the fetch+initialize orchestration and the hue-shift watch
  (formerly `useAppBootstrap.ts:116-120`) now live in one domain
  init, `initSuggestionColorCalibration()`. The payload is typed:
  `getResource<VisitDistributionData>` feeds the typed
  `setVisitDistribution` directly — the `<any>` at the old
  `resource-service.ts:55` is gone, using the typed half that
  already existed in `engine/suggestion-colors.ts`.
- **Home of the init: composable, not `suggestion-colors.ts` itself.**
  The item sanctioned either. The engine band is currently clean of
  `services/` and store imports (verified by grep across
  `src/engine/`); an init inside `engine/suggestion-colors.ts` would
  have created the band's first engine→services and engine→store
  edges, the exact erosion class the audit's L7 flags. The
  composables layer is the codebase's home for wiring services to
  engine code, so the "small board-side calibration composable"
  option was taken.
- **`useAppBootstrap.ts`** — the watch block and the onMounted
  fire-and-forget call are replaced by the single named domain-init
  call `initSuggestionColorCalibration()` at setup time; the
  `resourceService` and `setIntensityHueShift` imports drop out.
- **Ordering tolerance preserved.** The hue-shift watch keeps its
  `{ immediate: true }` setup-time semantics (consumers see the
  hue-shifted linear gradient before first paint, as before); the
  distribution fetch keeps its fire-and-forget catch (api.request
  surfaces the HTTP error to the system log; the catch stops the
  rejection from escaping the bootstrap). One deliberate timing
  shift, recorded loudly: the fetch now starts at setup time rather
  than in `onMounted` after `auth.tryAutoLogin()`. This is safe
  because the `/resources/{name}` endpoints are unauthenticated
  (the module's own documented contract — a JWT header is a benign
  no-op), `api.request` does not implicitly ensure authentication
  (verified against `api-client.ts`, so no cold-start auth race is
  re-introduced), and the suggestion-colors module is documented
  order-tolerant in both directions.
- **Dead alias removed.** `initializeIntensityFactory` in
  `suggestion-colors.ts` existed solely as a back-compat alias for
  resource-service's import; after the move it had zero call sites,
  so it is deleted rather than left as a vestige. Stale comments in
  `suggestion-colors.ts` that named `resourceService` /
  `useAppBootstrap` as the callers now point at the calibration
  init.
- **FILES.md** — `useAppBootstrap.ts` retagged `[B1]` → `[B3]`
  honestly as wiring per the App.vue precedent (it remains
  band-mixed through its analysis-service / qEUBO / keybindings
  imports regardless of this change; the row says so); the
  `resource-service.ts` row now describes the generic verb; a row
  added for the new composable. No IDENTIFIERS.md change — no new
  brand (`VisitDistributionData` is a pre-existing structural
  interface, not an identifier type).

## Verification

- `npm run build` (vue-tsc -b + vite build): clean.
- `npm run test:run`: 843 passed, 4 skipped, 0 failed.
- `npx eslint .`: clean.
- **Gradient cold-start is manual-smoke-only** — no automated
  coverage of the suggestion-color gradient's cold-start exists, and
  no manual smoke was performed in this session (no running
  backend/proxy stack in the worktree). The smoke — cold-load the
  SPA, confirm move-suggestion overlays and the BoardTab rugplot
  pick up the calibrated gradient rather than staying placeholder
  gray, and that the hue slider still rebuilds it — is owed before
  this is treated as validated end-to-end.

## Deferred / notes

- `getResource<T>` still trusts the transport-layer
  `api.request<T>` generic (JSON.parse cast by generics, no runtime
  narrowing) — that is the existing api-client posture, owned by the
  boundary-typing items (audit §A), not this seam arc.
- The duplicated mini-header comment at `suggestion-colors.ts:22-24`
  predates this change and was left untouched (minimal-touch).

---

License: Public Domain (The Unlicense).
