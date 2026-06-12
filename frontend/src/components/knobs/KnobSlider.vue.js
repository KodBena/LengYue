/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
/**
 * Scalar-knob slider widget — the unified UI primitive for every
 * `inputs.length === 1` KnobDecl in the registry (knob-registry
 * Phase 3b). One-dimensional UI control over a one-dimensional
 * quantity per the plan §6's widget dispatch policy.
 *
 * Reads the current value via the substrate's path walk; writes
 * through the profile owner's `writeStoreKnobValue` seam (which
 * dispatches `lib/knobs.ts::writeKnobValue` with the live store
 * root) so the policy dispatch machinery (claim state,
 * soft-release-on-manual-write) engages on every drag. The
 * disabled state and tooltip derive from the per-knob claim — a
 * hard-claimed knob renders the slider disabled, with the holder's
 * `consumerId` (and optional `reason`) surfaced in the title.
 *
 * The widget is widget-only — no business logic, no domain
 * knowledge, no Go-specific vocabulary. Band 1 per ADR-0003;
 * displaceable to any future cross-domain editor surface without
 * modification.
 */
import { computed, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { store } from '../../store';
import { writeStoreKnobValue } from '../../store/profile-owner';
import { readKnob, currentClaim, onClaimChange, } from '../../lib/knobs';
const { t } = useI18n();
const props = withDefaults(defineProps(), {
    compact: false,
});
// Reactive registry lookup — picks up post-hydrate seeding and any
// future user-side decl mutations without re-mounting the widget.
const decl = computed(() => store.profile.settings.knobs[props.knobId] ?? null);
const range = computed(() => {
    const r = decl.value?.inputs[0]?.range;
    return r ?? [0, 1];
});
const path = computed(() => decl.value?.outputs[0]?.path ?? '');
/**
 * Cross-knob constraint: when `decl.inputs[0].maxFromKnob` is
 * set, the slider's effective max is
 * `min(static-range-max, linked-knob-value)`. The linked-knob
 * read is reactive so a change to the linked knob's stored
 * value reflows the slider's max here. The substrate's
 * `validateRegistry` checks the reference resolves at startup
 * (ADR-0002); this widget is defensive — if the reference
 * silently dangles at render time (e.g. an experiment-time
 * dynamic decl), fall back to the static max rather than
 * throwing on the render path.
 *
 * The stored leaf is NOT auto-clamped when the linked knob's
 * value decreases below it; user preference is preserved. The
 * wire-layer consumer (`analysis-service.ts` for the cadence
 * knobs) applies `Math.min` at send time so the contract
 * reaching the engine is always coherent regardless of stored-
 * leaf state.
 */
const linkedMax = computed(() => {
    const linked = decl.value?.inputs[0]?.maxFromKnob;
    if (!linked)
        return null;
    const linkedDecl = store.profile.settings.knobs[linked];
    if (!linkedDecl)
        return null;
    const linkedPath = linkedDecl.outputs[0]?.path;
    if (!linkedPath)
        return null;
    try {
        const v = readKnob(store, linkedPath);
        return Number.isFinite(v) ? v : null;
    }
    catch {
        return null;
    }
});
const effectiveMax = computed(() => {
    const linked = linkedMax.value;
    return linked === null ? range.value[1] : Math.min(range.value[1], linked);
});
/**
 * Absolute lower bound: when `decl.inputs[0].minFloor` is set, the
 * slider's effective min is `max(range[0], minFloor)`. Drags below
 * the floor pin to it. Used by the at-floor visual indicator below
 * to surface to the user that the displayed value is at an
 * external-constraint-induced lower bound rather than the knob's
 * intrinsic minimum. The substrate's `validateRegistry` checks the
 * floor is finite and within the static range; this widget is
 * defensive — a non-finite floor at render time falls through to
 * the static range[0] rather than throwing on the render path.
 *
 * Like `effectiveMax` above, the stored leaf is NOT auto-clamped
 * when the floor is in force; user preference is preserved. The
 * wire-layer consumer applies `Math.max(minFloor, …)` at send time
 * so the contract reaching the dependency is always coherent.
 */
const effectiveMin = computed(() => {
    const f = decl.value?.inputs[0]?.minFloor;
    if (f === undefined || !Number.isFinite(f))
        return range.value[0];
    return Math.max(range.value[0], f);
});
/**
 * Step size derived from the *effective* range span (after the
 * `maxFromKnob` cross-knob constraint is applied), not the
 * static range. Target 100 discrete steps across the slider —
 * enough granularity that drag feels continuous, tractable
 * enough that the user can ratchet by single steps with the
 * keyboard.
 *
 * The effective-range derivation matters for linked knobs:
 * the first-report-after knob's static range is [0.001, 4.0],
 * but its effective max follows the cadence knob's stored
 * value (typically 0.15 at default). Computing step from
 * the static range gave only ~3-4 distinct positions on the
 * effective range; computing from the effective span keeps
 * the 100-step density honest as the linked-knob constraint
 * narrows or widens the slider's reach.
 *
 * magic-literal: 100 is a nice round number for a smooth
 * slider — fine enough that adjacent positions feel adjacent
 * on the drag, coarse enough that adjacent step values stay
 * distinguishable at the badge precision the formula below
 * computes.
 *
 * Defensive: when the linked-knob constraint has collapsed the
 * effective span to zero (linked-knob value at-or-below this
 * knob's static min), the slider has no movement room anyway;
 * fall back to the static-range step so the input element
 * still renders with a positive step value (HTML's `<input
 * type="range">` errors on step="0").
 */
const TARGET_STEP_COUNT = 100;
const step = computed(() => {
    const lo = effectiveMin.value;
    const effectiveSpan = effectiveMax.value - lo;
    if (effectiveSpan > 0) {
        return effectiveSpan / TARGET_STEP_COUNT;
    }
    return (range.value[1] - range.value[0]) / TARGET_STEP_COUNT;
});
/**
 * Decimal places needed to distinguish adjacent step values in
 * the badge display. `ceil(-log10(step))` is the smallest
 * precision at which two adjacent values differ in the
 * displayed string: step 0.04 → 2 dp ("0.04" vs "0.08"); step
 * 0.0014 → 3 dp ("0.001" vs "0.003"); step 49.5 → 0 dp
 * ("49" vs "99"). Clamped at 0 (no negative precisions) and
 * defensive against non-finite or zero step (fallback 2 dp,
 * the previous heuristic's default for small-span knobs).
 */
const precision = computed(() => {
    const s = step.value;
    if (!Number.isFinite(s) || s <= 0)
        return 2;
    return Math.max(0, Math.ceil(-Math.log10(s)));
});
const value = computed(() => {
    if (!path.value)
        return 0;
    try {
        return readKnob(store, path.value);
    }
    catch {
        // The registry decl points at a path that doesn't resolve.
        // The render shouldn't break; `validateRegistry` (wired in
        // bootstrap) raises this loudly elsewhere. Return the range
        // lo so the slider sits at a sensible default until the path
        // is fixed.
        return range.value[0];
    }
});
// Display clamped to [effectiveMin, effectiveMax] so the badge
// agrees with the slider thumb's pinned position when either the
// linked-knob upper constraint OR the absolute lower-floor pin
// caps the displayed value. Stored leaf preserves the user's
// preference; only the display (and the wire-layer clamp at send
// time) reflect the constraints.
const displayValue = computed(() => {
    const clamped = Math.min(Math.max(value.value, effectiveMin.value), effectiveMax.value);
    return clamped.toFixed(precision.value);
});
/**
 * True when the displayed (clamped) value sits at the absolute
 * lower-floor pin AND the floor is genuinely active (i.e. the floor
 * is above the static range's lower bound — otherwise sitting at
 * `range[0]` is just the natural slider-bottom position, not an
 * upstream-constraint pin).
 *
 * When true, the badge gets a CSS marker (dotted underline + help
 * cursor — the standard "more info on hover" convention) and a
 * `title` tooltip looked up via i18n at
 * `knobRegistry.floorTooltip.<knobId>`. The lookup falls back to
 * the empty string if no catalogue entry exists, so the marker
 * shows but no tooltip text appears — the per-knob explanation is
 * opt-in via translation.
 */
const atFloor = computed(() => {
    const floor = decl.value?.inputs[0]?.minFloor;
    if (floor === undefined || !Number.isFinite(floor))
        return false;
    if (floor <= range.value[0])
        return false;
    // Compare against the *raw* stored value, not displayValue's
    // string form — a user with a stored leaf below the floor sees
    // the slider pinned at the floor (visual signal) and the tooltip
    // available even if displayValue rounded equal to the floor for
    // unrelated reasons.
    return value.value <= effectiveMin.value;
});
const floorTooltip = computed(() => {
    if (!atFloor.value || !decl.value)
        return '';
    const key = `knobRegistry.floorTooltip.${decl.value.id}`;
    const translated = t(key);
    return translated !== key ? translated : '';
});
/**
 * Resolve the knob's user-facing label through i18n. The convention
 * is `knobRegistry.label.<knobId>` — when the catalog carries that
 * key, the translated string wins. The fallback chain:
 *
 *   1. i18n hit on `knobRegistry.label.<id>` — translated string.
 *   2. `decl.label` — the English literal seeded in defaults /
 *      migrations.
 *   3. `decl.id` — last resort so something always renders.
 *
 * Mirrors `KnobRegistryEditor.vue::domainLabel`'s hint-or-derive
 * pattern; runtime-added decls (e.g. `qeubo.<param>` for
 * user-named parameters) skip step 1 since no catalog entry
 * exists for arbitrary param names, and fall through to `label`
 * (which the migration / `ensureKnobDecl` set to the param name).
 */
const displayLabel = computed(() => {
    if (!decl.value)
        return '';
    const key = `knobRegistry.label.${decl.value.id}`;
    const translated = t(key);
    if (translated !== key)
        return translated;
    return decl.value.label ?? decl.value.id;
});
// ── Claim-state reactivity ───────────────────────────────────────
const claim = ref(currentClaim(props.knobId));
const unsubscribe = onClaimChange((event) => {
    if (event.knobId === props.knobId) {
        claim.value = event.next;
    }
});
onUnmounted(unsubscribe);
const disabled = computed(() => claim.value?.policy === 'hard');
const disabledTitle = computed(() => {
    if (!disabled.value)
        return '';
    const c = claim.value;
    return t('knobRegistry.lockedTooltip', {
        holder: c.consumerId,
        reason: c.reason ? ` (${c.reason})` : '',
    });
});
// ── User input ───────────────────────────────────────────────────
function onInput(event) {
    const raw = event.target.value; // DOM: handler bound on the slider <input>, so target is that element
    const n = Number(raw);
    if (!Number.isFinite(n))
        return;
    // The substrate's policy machinery decides: write succeeds against
    // an unclaimed knob, refuses loudly against a hard-claimed knob (the
    // belt-and-braces guard for the disabled-widget case), and releases
    // a soft claim before writing. The return value names which path
    // ran but the widget doesn't need to surface it — the value
    // computed re-reads on the next tick. Routed through the profile
    // owner's store-root seam (settings-profile-mutator-owner) so the
    // widget never hands the live store to the substrate itself.
    writeStoreKnobValue(props.knobId, [n], { kind: 'manual' });
}
const __VLS_defaults = {
    compact: false,
};
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['knob-slider-input']} */ ;
/** @type {__VLS_StyleScopedClasses['knob-slider-compact']} */ ;
/** @type {__VLS_StyleScopedClasses['knob-slider-input']} */ ;
if (__VLS_ctx.decl) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: (['knob-slider-row', { 'knob-slider-compact': __VLS_ctx.compact }]) },
    });
    /** @type {__VLS_StyleScopedClasses['knob-slider-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['knob-slider-compact']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "knob-slider-label-text" },
        title: (__VLS_ctx.displayLabel),
    });
    /** @type {__VLS_StyleScopedClasses['knob-slider-label-text']} */ ;
    (__VLS_ctx.displayLabel);
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onInput: (__VLS_ctx.onInput) },
        type: "range",
        min: (__VLS_ctx.effectiveMin),
        max: (__VLS_ctx.effectiveMax),
        step: (__VLS_ctx.step),
        value: (__VLS_ctx.value),
        disabled: (__VLS_ctx.disabled),
        title: (__VLS_ctx.disabledTitle),
        ...{ class: "knob-slider-input" },
    });
    /** @type {__VLS_StyleScopedClasses['knob-slider-input']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: (['knob-slider-value', { 'knob-slider-value-at-floor': __VLS_ctx.atFloor }]) },
        title: (__VLS_ctx.floorTooltip),
    });
    /** @type {__VLS_StyleScopedClasses['knob-slider-value']} */ ;
    /** @type {__VLS_StyleScopedClasses['knob-slider-value-at-floor']} */ ;
    (__VLS_ctx.displayValue);
}
// @ts-ignore
[decl, compact, displayLabel, displayLabel, onInput, effectiveMin, effectiveMax, step, value, disabled, disabledTitle, atFloor, floorTooltip, displayValue,];
const __VLS_export = (await import('vue')).defineComponent({
    __defaults: __VLS_defaults,
    __typeProps: {},
});
export default {};
