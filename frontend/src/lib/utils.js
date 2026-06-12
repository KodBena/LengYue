/**
 * src/lib/utils.ts
 *
 * Domain-free utility helpers: debounce, plain-object guard +
 * deep-merge (hydration default-backfill), RFC4122 v4 UUID
 * generation, and the silent-create registry deep-write behind the
 * Settings editors. Band 1 per ADR-0003 — nothing here knows about
 * Go, game trees, or the engine wire.
 *
 * License: Public Domain (The Unlicense)
 */
/**
 * Simple debounce implementation to avoid external dependencies.
 */
export function debounce(fn, delay) {
    let timeoutId = null;
    return (...args) => {
        if (timeoutId)
            clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            fn(...args);
        }, delay);
    };
}
/**
 * Type-guard for plain objects.
 */
export function isObject(item) {
    return (item && typeof item === 'object' && !Array.isArray(item));
}
/**
 * Deep merge utility to prevent hydration from wiping out new default keys.
 */
export function deepMerge(target, source) {
    let output = Object.assign({}, target);
    if (isObject(target) && isObject(source)) {
        Object.keys(source).forEach(key => {
            if (isObject(source[key])) {
                if (!(key in target))
                    Object.assign(output, { [key]: source[key] });
                else
                    output[key] = deepMerge(target[key], source[key]);
            }
            else {
                Object.assign(output, { [key]: source[key] });
            }
        });
    }
    return output;
}
/**
 * Deep-write `value` at the string-segment `path` under `root`,
 * silently creating intermediate objects along the way. The generic
 * write primitive behind the Settings editors' `update` events
 * (`SettingsTab.vue`) and the dirty-board-guard's remembered
 * preference.
 *
 * Calibration note (ADR-0002): the silent-create / any-value
 * contract here is deliberately different from `lib/knobs.ts`'s
 * path walkers, which throw on missing parents and accept finite
 * numbers only. Co-located, never merged — collapsing the two would
 * erase a deliberate fail-loud calibration difference
 * (history-lessons audit 2026-06-10, §3.19).
 */
export function updateRegistry(root, path, value) {
    if (!path.length)
        return;
    let current = root;
    for (let i = 0; i < path.length - 1; i++) {
        const key = path[i];
        if (current[key] === null || typeof current[key] !== 'object') {
            current[key] = {};
        }
        current = current[key];
    }
    const finalKey = path[path.length - 1];
    current[finalKey] = value;
}
/**
 * RFC4122 v4 UUID. Prefers `crypto.randomUUID()`; falls back to a
 * manual construction over `crypto.getRandomValues` when the former
 * is unavailable.
 *
 * `crypto.randomUUID` is only present on **secure contexts** —
 * HTTPS or localhost. Accessing the Vite dev server via a LAN IP
 * (e.g. `http://192.168.x.x:5173`) is not a secure context, so the
 * method is undefined there. `crypto.getRandomValues` is available
 * in every context, so the fallback works regardless. Per ADR-0002,
 * call sites go through this helper rather than the bare API to
 * avoid silent context-dependent failures.
 */
export function generateUUID() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
    const hex = [];
    for (const b of bytes)
        hex.push(b.toString(16).padStart(2, '0'));
    return [
        hex.slice(0, 4).join(''),
        hex.slice(4, 6).join(''),
        hex.slice(6, 8).join(''),
        hex.slice(8, 10).join(''),
        hex.slice(10, 16).join(''),
    ].join('-');
}
