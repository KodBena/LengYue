/**
 * src/store/migration-witness.ts
 * The independent runtime-shape witness and the `witnessedContainer`
 * leaf-assertion helper shared by `migrations.ts` (active bodies) and
 * `archived-migrations.ts` (bodies that have since aged out under the
 * rolling-archive cadence).
 *
 * ── Why a separate module ──────────────────────────────────────────
 * The helper was introduced in `migrations.ts` (work-status item
 * `migration-leaf-assertion-and-composition-test`). `migrations.ts`
 * imports `archivedMigrations` from `archived-migrations.ts`, so the
 * dependency arrow already points migrations → archived. The
 * rolling-archive cadence ages migration bodies out of `migrations.ts`
 * into `archived-migrations.ts` *verbatim*; the first body authored
 * against `witnessedContainer` to age out (57 → 58) carries the helper
 * call with it, which would force a back-edge archived → migrations and
 * a module cycle. The helper's own "FROZEN ONCE SHIPPED" docstring
 * anticipated this — it speaks of paths witnessed by "active or
 * archived-later" bodies — so the resolution is to home the helper in a
 * leaf module both files import, not to introduce the cycle. `migrations.ts`
 * re-exports `witnessedContainer` so existing importers (the unit suite)
 * keep their import path.
 *
 * The helper's observable semantics are frozen here for the same reason
 * the bodies that call it are frozen: a behavioural change would silently
 * retro-edit shipped migrations in the wild (the append-only invariant).
 * If different semantics are ever needed, mint a NEW helper and leave
 * this one untouched.
 *
 * License: Public Domain (The Unlicense)
 */
import { defaultProfile, defaultSessionUI, NIL_UUID } from './defaults';
/**
 * Runtime-shape witness for `witnessedContainer` below: the persisted
 * blob's container skeleton, assembled from the same defaults the
 * runtime store hydrates from. `buildPersistencePayload` in
 * `store/index.ts` is the save-side mirror of this shape — these are
 * the paths the runtime actually reads, which is what makes the
 * witness *independent* of any migration body's own blob walk.
 *
 * Deliberately built from the live `defaults` module rather than a
 * frozen inline snapshot: the witness asserts that a migration's
 * target container exists in the *current* runtime shape, and new
 * containers added later must be witnessable without editing frozen
 * helper data. This is NOT the mutable-constant hazard the 42 → 43
 * archived body's freeze note warns about — that note is about a
 * migration's *output values* drifting silently; the witness is an
 * assertion input whose drift fails loudly (a throw at hydrate), the
 * opposite failure mode.
 */
const PERSISTED_SHAPE_WITNESS = {
    schemaVersion: 0,
    boards: [],
    activeBoardIndex: 0,
    profile: defaultProfile,
    session: {
        id: NIL_UUID,
        profileId: NIL_UUID,
        ui: defaultSessionUI,
        reviews: {},
    },
};
/**
 * Leaf-assertion helper for migration bodies (work-status item
 * `migration-leaf-assertion-and-composition-test`, audit
 * `docs/notes/audit/audit-spa-history-lessons-2026-06-10.md` §3.13;
 * extends Phase 1 of
 * `docs/notes/design/migration-test-rotation-plan.md`).
 *
 * Resolves a dot-separated container path on the blob in two legs:
 *
 *   1. **Witness leg (fail loud, ADR-0002).** The path must resolve
 *      against `PERSISTED_SHAPE_WITNESS` — the runtime persisted
 *      shape. A path the runtime never reads throws immediately.
 *      This is the independent witness: the 47 → 48 F-optimizer
 *      retirement walked `out.settings?.knobs` instead of
 *      `out.profile?.settings?.knobs` and silently no-oped on every
 *      blob while still stamping v48; an assertion that re-walks the
 *      body's own path would have conditioned out on the same typo.
 *   2. **Blob leg (tolerant, unchanged semantics).** The same path is
 *      walked on the blob with optional-chain semantics; returns the
 *      container when it is a non-null `typeof 'object'` value
 *      (arrays included — matching the inline guards this replaces),
 *      else `undefined`, so partial / legacy blobs no-op exactly as
 *      before. Pass the PARENT container's path, not the leaf's: a
 *      stripped or backfilled leaf is usually absent from the current
 *      shape by design; its parent is what the runtime still reads.
 *
 * ── FROZEN ONCE SHIPPED ────────────────────────────────────────────
 * Shipped migration bodies call this helper, and bodies are frozen as
 * they shipped — which makes this helper a dependency of frozen code.
 * From the first release that ships a body calling it, the helper's
 * observable semantics are frozen with those bodies: a behavioural
 * change here would silently retro-edit shipped migrations in the
 * wild, the exact failure the append-only invariant exists to
 * prevent. If different semantics are ever needed, mint a NEW helper
 * and leave this one untouched.
 *
 * Two scope rules that follow:
 *   - Bodies authored against this helper keep their call verbatim when
 *     they age out under the rolling-archive cadence; the archive
 *     imports the helper from this leaf module so the move stays a pure
 *     cut-and-paste. Pre-helper archived bodies keep their original
 *     inline guards verbatim; retrofitting frozen bodies is forbidden.
 *   - A witnessed path is a forward commitment: while any body
 *     (active or archived-later) witnesses it, the persisted shape
 *     must keep carrying that container, or hydration of pre-that-
 *     version blobs fails loudly. That loud failure is the design
 *     (better than a silent no-op stamp), but a future restructuring
 *     arc that renames a witnessed container must revisit the frozen
 *     bodies' witness viability in the same change.
 */
export function witnessedContainer(blob, witnessPath) {
    const segments = witnessPath.split('.');
    // Witness leg.
    let witness = PERSISTED_SHAPE_WITNESS;
    for (const segment of segments) {
        if (witness === null || typeof witness !== 'object' || !(segment in witness)) {
            throw new Error(`witnessedContainer: '${witnessPath}' does not resolve against the ` +
                `runtime persisted shape (failed at segment '${segment}'). The ` +
                `migration names a container the runtime never reads — the 47 → 48 ` +
                `wrong-path class. Fix the path; do not loosen the witness.`);
        }
        // Justified cast: the line above proves `witness` is a non-null
        // object carrying `segment`; TS cannot narrow `unknown` through
        // the `in` check without a wider type assertion than this one.
        witness = witness[segment];
    }
    // Blob leg.
    let current = blob;
    for (const segment of segments) {
        if (current === null || current === undefined)
            return undefined;
        // Justified cast: indexing a primitive (string / number / boolean)
        // yields `undefined` for these segment names, which the next
        // iteration's null/undefined guard absorbs — same tolerance as
        // the optional-chained reads this helper replaces.
        current = current[segment];
    }
    return current !== null && typeof current === 'object'
        // Justified cast: arrays deliberately pass (typeof 'object'),
        // mirroring the `value && typeof value === 'object'` inline
        // guards the active bodies used before the retrofit.
        ? current
        : undefined;
}
