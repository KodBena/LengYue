import { ref, computed, watch } from 'vue';
import { debounce } from '../../lib/utils';
import { TIMELINE_SELECTION_DEBOUNCE_MS } from '../../lib/timing';
/**
 * Composable for timeline logic.
 * Handles contiguous segment calculation, selection range state, and debounced updates.
 */
export function useTimelineLogic(dataVector, debounceMs = TIMELINE_SELECTION_DEBOUNCE_MS) {
    /**
     * Computes contiguous segments where values are > 0.
     * A segment is defined as a contiguous block of indices where data is present.
     */
    const segments = computed(() => {
        const result = [];
        let start = null;
        const vector = dataVector.value;
        const createSegment = (s, e) => {
            const values = vector.slice(s, e + 1);
            const min = Math.min(...values);
            const max = Math.max(...values);
            const mean = values.reduce((a, b) => a + b, 0) / values.length;
            return { start: s, end: e, values, stats: { min, max, mean } };
        };
        for (let i = 0; i < vector.length; i++) {
            if (vector[i] > 0) {
                if (start === null)
                    start = i;
            }
            else {
                if (start !== null) {
                    result.push(createSegment(start, i - 1));
                    start = null;
                }
            }
        }
        if (start !== null) {
            result.push(createSegment(start, vector.length - 1));
        }
        return result;
    });
    /**
     * Selection range state [min, max].
     */
    const selectionRange = ref([0, Math.min(dataVector.value.length, 100)]);
    /**
     * Debounced selection range for "driving" heavy components like ECharts.
     */
    const debouncedRange = ref([...selectionRange.value]);
    const updateDebounced = debounce((val) => {
        debouncedRange.value = [...val];
    }, debounceMs);
    watch(selectionRange, (newVal) => {
        updateDebounced(newVal);
    }, { deep: true });
    const setSelectionRange = (start, end) => {
        selectionRange.value = [start, end];
    };
    return {
        segments,
        selectionRange,
        debouncedRange,
        setSelectionRange
    };
}
