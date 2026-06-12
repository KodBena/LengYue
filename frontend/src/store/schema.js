/**
 * src/store/schema.ts
 *
 * The persisted GlobalStore schema — `AppSettings`, `UISession`, the
 * persisted-slice types they aggregate (thumbnails, minting,
 * navigation, analysis tabs, forest/card-tree navigator state), and
 * the top-level `ProfileState` / `SessionState` / `GlobalStore`
 * containers. Colocated with `store/defaults.ts` so each persisted
 * slice's type sits beside its default. Carries one runtime export
 * (`BUNDLE_COMPRESSION_SCHEMES`); every import below is type-only,
 * so this module has no runtime dependencies and the barrel
 * (`src/types.ts`) re-export graph stays acyclic. Carved from the
 * single-file `src/types.ts` (2026-06-10, history-lessons audit
 * §3.15); bodies are verbatim from the pre-split file.
 *
 * License: Public Domain (The Unlicense)
 */
/**
 * Analysis-bundle wire-format choices. `'v1-json'` is the legacy
 * canonical-JSON wire (backend codec: json / json+gzip);
 * `'json-projected-v1'` is the cross/analysis-bundle-compression-v2
 * arc's lossless leaf (frontend projects + JSON-stringifies +
 * UTF-8s; backend brotli-wraps unconditionally for storage). See
 * `AppSettings.engine.katago.bundleCompressionScheme` below for
 * the contract and `services/analysis-bundle/encoder.ts` for the
 * encoder hierarchy. Tuple-then-type pattern mirrors
 * `WINRATE_FRAMINGS` in `engine/katago/types.ts`; consumers
 * (RegistryEditor's PATH_ENUMS, the auto-save composable) import
 * the const tuple directly so this declaration is the single
 * source of truth.
 */
/**
 * The user-facing registry values name the wire-format choice
 * (`'v1'` = legacy canonical-JSON, `'v2-projected'` = v2 with
 * the SPA-side projection encoder). The encoder's *internal*
 * scheme tag — the string the backend stores in
 * `format_descriptor.scheme` forever — is `'json-projected-v1'`
 * (declared in `services/analysis-bundle/encoder.ts`); the
 * registry-to-encoder mapping lives in
 * `analysis-persistence-service.ts::readCompressionScheme`.
 * Decoupling the two strings keeps the user-facing names
 * versionable (`'v2-projected'` may grow `'v2-projected-q4'`
 * later) without breaking the on-wire scheme tag's stable
 * identity.
 */
export const BUNDLE_COMPRESSION_SCHEMES = [
    'v1',
    'v2-projected',
    'v2-quantized',
    'v2-quantized-hifi',
    'v2-quantized-hifi-xor',
];
