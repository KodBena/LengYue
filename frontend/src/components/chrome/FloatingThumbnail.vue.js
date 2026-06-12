/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../../.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, ref, shallowRef, onUnmounted } from 'vue';
import MiniBoard from '../board/MiniBoard.vue';
const posX = ref(0);
const posY = ref(0);
const visible = ref(false);
// The host-supplied snapshot accessor (see the header's content contract).
// shallowRef: the accessor is an opaque closure; only reassignment matters.
const source = shallowRef(null);
// Derived content — null while hidden or on a cache miss. Reading the
// accessor here (and only here) keeps the cache subscription leaf-local.
const snapshot = computed(() => visible.value ? (source.value?.() ?? null) : null);
// Iter-1 audit: caller passes the raw cursor position; the CURSOR_OFFSET_PX
// nudge below places the thumbnail to the right of and slightly below the
// cursor. Without clamping, hovers near the right or bottom viewport edge
// painted the 150×150 thumbnail partially offscreen. Clamp at show()-time
// using window inner dimensions — corner case of window resize mid-hover is
// ignored (thumbnail is hidden on mouseleave anyway).
// magic-literal: 154 = thumbnail outer box. Sum of the inner 150px
// (CSS `.floating-thumb { width: 150px; height: 150px }` below) +
// 2px border on each side (the `border: 2px solid` in the same
// rule). If the .floating-thumb width/height/border changes, this
// constant must track them — they have no shared substrate token.
const THUMB_BOX = 154;
// magic-literal: 20px cursor-offset for thumbnail anchor. Composes
// with the caller's own cursor offset so the thumbnail lands to the
// right of, and slightly below, the cursor. (TreeWidget passes the
// raw cursor; the former SidebarWidget caller added its own nudge
// before that host moved to the docked pane.) If you retune the
// pair, retune both.
const CURSOR_OFFSET_PX = 20;
// magic-literal: 80px hide-radius — the seam-level backstop for a LOST
// mouseleave, which is the dominant (and nondeterministic) source of the
// "lingers forever" finickiness. show() records the cursor position the host
// anchored at; while the pointer stays within this radius the preview holds,
// and the first pointer movement beyond it hides the preview. The reason a
// plain `mouseleave` is not enough: TreeWidget's `.toggle-group` <g> elements
// are re-created on every tree re-render, and a pointer on (or moving off) a
// <g> that is removed/replaced under it never receives the element-level
// `mouseleave`, so the host's hide() never fires and the box is stranded.
// Anchoring visibility to the live pointer rather than trusting the per-element
// leave converts "lingers forever" into "hides as soon as the pointer moves
// away". This COMPOSES with the host's mouseleave (still the fast path on a
// clean leave); it does not replace it. The listener is bound only while
// visible, so there is no always-on document-listener cost.
// Tunable by eye: large enough that in-element jitter does not false-hide,
// small enough that leaving the element hides promptly.
const HIDE_RADIUS_PX = 80;
let anchorX = 0;
let anchorY = 0;
function onDocPointerMove(e) {
    if (!visible.value)
        return;
    const dx = e.clientX - anchorX;
    const dy = e.clientY - anchorY;
    if (dx * dx + dy * dy > HIDE_RADIUS_PX * HIDE_RADIUS_PX) {
        hide();
    }
}
// Release every stranding watcher. Called from hide() and onUnmounted; safe to
// run when nothing is bound (removeEventListener on an unregistered pair is a
// no-op). removeEventListener must echo the capture flag the matching add used.
function detachWatchers() {
    document.removeEventListener('pointermove', onDocPointerMove);
    document.removeEventListener('scroll', hide, true);
    window.removeEventListener('blur', hide);
}
function hide() {
    visible.value = false;
    // Release the host's accessor closure (it captures the hovered node's
    // label table); the next show() supplies a fresh one.
    source.value = null;
    detachWatchers();
}
const __VLS_exposed = {
    show: (snapshotSource, x, y) => {
        source.value = snapshotSource;
        anchorX = x;
        anchorY = y;
        const proposedX = x + CURSOR_OFFSET_PX;
        const proposedY = y + CURSOR_OFFSET_PX;
        const maxX = window.innerWidth - THUMB_BOX;
        const maxY = window.innerHeight - THUMB_BOX;
        posX.value = Math.max(0, Math.min(proposedX, maxX));
        posY.value = Math.max(0, Math.min(proposedY, maxY));
        visible.value = true;
        // Bind the stranding watchers (only while visible). Three ways a lost
        // mouseleave can strand the thumbnail, one watcher each:
        //   pointermove — the pointer wanders >HIDE_RADIUS_PX from the anchor;
        //   scroll      — the anchor element scrolls out from under a still pointer
        //                 (capture, since scroll does not bubble; passive, we never
        //                 preventDefault) — the live variation tree grows during
        //                 analysis, so this is the realistic stationary-pointer case;
        //   blur        — the window loses focus mid-hover.
        // addEventListener dedupes an identical (type, fn, capture) triple, so a
        // re-anchoring show() while already visible does not stack listeners.
        document.addEventListener('pointermove', onDocPointerMove);
        document.addEventListener('scroll', hide, { capture: true, passive: true });
        window.addEventListener('blur', hide);
    },
    hide,
};
defineExpose(__VLS_exposed);
// Safety net: if the host unmounts (e.g. the tree panel closes) while the
// thumbnail is still visible, hide() never runs and the watchers would leak.
// Drop them on teardown.
onUnmounted(detachWatchers);
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
if (__VLS_ctx.visible) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "floating-thumb" },
        ...{ style: ({ left: __VLS_ctx.posX + 'px', top: __VLS_ctx.posY + 'px' }) },
    });
    /** @type {__VLS_StyleScopedClasses['floating-thumb']} */ ;
    if (__VLS_ctx.snapshot) {
        const __VLS_0 = MiniBoard;
        // @ts-ignore
        const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
            snapshot: (__VLS_ctx.snapshot),
        }));
        const __VLS_2 = __VLS_1({
            snapshot: (__VLS_ctx.snapshot),
        }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    }
}
// @ts-ignore
[visible, posX, posY, snapshot, snapshot,];
const __VLS_export = (await import('vue')).defineComponent({
    setup: () => __VLS_exposed,
});
export default {};
