/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed } from 'vue';
import { BOARD_PX, LABEL_BAND, TOTAL_PX, STONE_RADIUS_RATIO, } from '../../engine/constants';
import { themeColor } from '../../utils/theme-color';
import { useMoveSuggestions } from '../../composables/board/use-move-suggestions';
const props = defineProps();
// Intersection set of currently-rendered move-suggestion discs,
// consulted only when the letter-mode → circle fallback could fire.
// `useMoveSuggestions` runs the same packet → filter → cluster
// chain that `MoveSuggestions.vue` runs; the double-eval cost is
// modest (sub-millisecond per analysis update) and is the
// minimal-touch alternative to lifting the suggestion list into a
// shared prop. The set short-circuits to empty whenever the
// fallback can't fire, so the steady-state cost is zero outside
// the (letters-mode AND suggestions-on) case.
const { suggestions } = useMoveSuggestions(() => props.state.currentNodeId);
const suggestionPoints = computed(() => {
    if (!props.showMoveSuggestions)
        return new Set();
    if (props.variationsMode !== 'letters')
        return new Set();
    const out = new Set();
    for (const s of suggestions.value)
        out.add(`${s.x},${s.y}`);
    return out;
});
// ── Geometry (mirrors BoardDisplay) ───────────────────────────────────────────
const pad = computed(() => BOARD_PX / (props.size + 1));
const cell = computed(() => (BOARD_PX - 2 * pad.value) / (props.size - 1));
const stoneR = computed(() => cell.value * STONE_RADIUS_RATIO);
// Marker radius matches MoveSuggestions's cluster-ring (1.01 ×
// stoneR) so the two ring families sit at the same diameter — the
// dashed stroke and z-index distinguish variations from
// transpositions, not size. magic-literal: 1.01 — cluster-ring
// radius from MoveSuggestions, mirrored verbatim. Future tuning
// would update both call sites.
const MARKER_RADIUS_RATIO = 1.01;
// Stroke width is thinner than MoveSuggestions's cluster-ring
// (2.5), so the variation ring reads as secondary information when
// both render at the same intersection. The dash pattern is what
// tells the two ring families apart, but a lighter weight also
// helps. magic-literal: 1.5 — empirically tuned against the user's
// "too thick" feedback at 2.5.
const MARKER_STROKE_WIDTH = 1.5;
// Dashed stroke pattern. magic-literal: "4 3" — 4-unit dashes with
// 3-unit gaps. At the marker radius (≈ 13.9 SVG units on a 19×19
// board, circumference ≈ 87 units), this produces ~12 dashes around
// the ring — clearly dashed without fragmenting into a near-solid
// rendering. The visual contract: solid stroke = transposition
// (engine analysis), dashed stroke = variation (game-tree state).
const MARKER_DASHARRAY = '4 3';
function toSvg(x, y) {
    return {
        x: pad.value + x * cell.value,
        y: pad.value + (props.size - 1 - y) * cell.value,
    };
}
// Variation rings share a single gray tint — the visual goal at
// this stage is "these are variations" as a class. Letters (in
// 'letters' mode) provide per-variation disambiguation but use a
// different drawing path entirely (see below): the ring is dropped
// and a black letter label appears at the intersection.
const VARIATION_TINT_ANCHOR = '--text-2';
// Active-next-move ring is a *lighter* gray than the variation
// rings — `--text-1` reads as "primary chrome text," brighter than
// `--text-2`, so the active marker stays visually distinct from a
// non-active variation when both render at the same time.
const ACTIVE_TINT_ANCHOR = '--text-1';
// Letters-mode label colour. Black on wood reads as a high-contrast
// SGF-style annotation, separate from the gray ring vocabulary.
// magic-literal: hex literal #000 chosen by the user's spec
// ("black letter labels"); not a substrate anchor candidate since
// the relationship is "this is the SGF letter convention" rather
// than a chrome decision.
const LETTER_LABEL_COLOR = '#000';
// Letter font size. magic-literal: 1.2 × stoneR — slightly larger
// than the in-ring letter sizing of the prior iteration since the
// letter sits alone on the wood texture without a ring backing.
const LETTER_FONT_SIZE_RATIO = 1.2;
const markers = computed(() => {
    const node = props.state.nodes[props.state.currentNodeId];
    if (!node || node.children.length === 0)
        return [];
    const out = [];
    let variationIdx = 0;
    for (let i = 0; i < node.children.length; i++) {
        const child = props.state.nodes[node.children[i]];
        // Defensive: a child reference without a node, or a child whose
        // move is null (root only) / a pass, has no board position.
        if (!child || !child.move || child.move.type !== 'place')
            continue;
        const isActive = i === node.activeChildIndex;
        const x = child.move.x;
        const y = child.move.y;
        if (isActive) {
            if (!props.showActiveNextMove)
                continue;
            // Active next move on the active path — light-gray dashed
            // ring. No label, even in 'letters' mode (A is reserved for
            // the first non-active sibling per the spec).
            // magic-literal: 0.7 opacity — visible against the wood
            // texture without competing with stones.
            out.push({
                x, y,
                key: `active-${x}-${y}`,
                ring: {
                    stroke: themeColor(ACTIVE_TINT_ANCHOR),
                    opacity: 0.7,
                },
                label: null,
            });
        }
        else {
            if (props.variationsMode === 'off')
                continue;
            const letter = String.fromCharCode(0x41 /* 'A' */ + variationIdx);
            if (props.variationsMode === 'circles') {
                // 'circles' mode: gray dashed ring, no letter.
                // magic-literal: 0.7 opacity — same as the active marker
                // since both are gray rings; the lighter / darker tint
                // distinguishes them, not opacity.
                out.push({
                    x, y,
                    key: `variation-${x}-${y}`,
                    ring: {
                        stroke: themeColor(VARIATION_TINT_ANCHOR),
                        opacity: 0.7,
                    },
                    label: null,
                });
            }
            else {
                // 'letters' mode. Two sub-cases:
                //
                //   - Overlap with a MoveSuggestion at this intersection
                //     → fall back to the 'circles' marker (gray dashed
                //     ring), per the file header's "Overlap with
                //     MoveSuggestions" note. The letter is silently
                //     dropped at this intersection only; `variationIdx`
                //     advances so the remaining letters stay in
                //     declaration order, leaving a visible gap that the
                //     suggestion disc fills in.
                //   - No overlap → black letter label only, no ring.
                //     Reads as the SGF-style A/B/C convention — high
                //     contrast on the wood texture.
                //
                // magic-literal: 0.9 letter opacity — slightly louder than
                // the gray rings since the letter is the sole carrier of
                // the variation identity in this sub-case.
                const overlapsSuggestion = suggestionPoints.value.has(`${x},${y}`);
                if (overlapsSuggestion) {
                    out.push({
                        x, y,
                        key: `variation-${x}-${y}`,
                        ring: {
                            stroke: themeColor(VARIATION_TINT_ANCHOR),
                            opacity: 0.7,
                        },
                        label: null,
                    });
                }
                else {
                    out.push({
                        x, y,
                        key: `variation-${x}-${y}`,
                        ring: null,
                        label: {
                            text: letter,
                            color: LETTER_LABEL_COLOR,
                            opacity: 0.9,
                        },
                    });
                }
            }
            variationIdx++;
        }
    }
    return out;
});
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
__VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
    viewBox: (`0 0 ${__VLS_ctx.TOTAL_PX} ${__VLS_ctx.TOTAL_PX}`),
    ...{ class: "variations-overlay" },
    'aria-hidden': "true",
});
/** @type {__VLS_StyleScopedClasses['variations-overlay']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
    transform: (`translate(${__VLS_ctx.LABEL_BAND}, ${__VLS_ctx.LABEL_BAND})`),
});
for (const [m] of __VLS_vFor((__VLS_ctx.markers))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        key: (m.key),
    });
    if (m.ring !== null) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
            cx: (__VLS_ctx.toSvg(m.x, m.y).x),
            cy: (__VLS_ctx.toSvg(m.x, m.y).y),
            r: (__VLS_ctx.stoneR * __VLS_ctx.MARKER_RADIUS_RATIO),
            fill: "none",
            stroke: (m.ring.stroke),
            'stroke-width': (__VLS_ctx.MARKER_STROKE_WIDTH),
            'stroke-dasharray': (__VLS_ctx.MARKER_DASHARRAY),
            opacity: (m.ring.opacity),
        });
    }
    if (m.label !== null) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.text, __VLS_intrinsics.text)({
            x: (__VLS_ctx.toSvg(m.x, m.y).x),
            y: (__VLS_ctx.toSvg(m.x, m.y).y + 1),
            'font-size': (__VLS_ctx.stoneR * __VLS_ctx.LETTER_FONT_SIZE_RATIO),
            'dominant-baseline': "middle",
            'text-anchor': "middle",
            'font-family': "monospace",
            'font-weight': "bold",
            fill: (m.label.color),
            opacity: (m.label.opacity),
        });
        (m.label.text);
    }
    // @ts-ignore
    [TOTAL_PX, TOTAL_PX, LABEL_BAND, LABEL_BAND, markers, toSvg, toSvg, toSvg, toSvg, stoneR, stoneR, MARKER_RADIUS_RATIO, MARKER_STROKE_WIDTH, MARKER_DASHARRAY, LETTER_FONT_SIZE_RATIO,];
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
