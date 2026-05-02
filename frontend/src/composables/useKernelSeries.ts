/**
 * src/composables/useKernelSeries.ts
 * Projects a single MetricKernel over an anchored variation path.
 * License: Public Domain (The Unlicense)
 */
import { computed, type Ref } from 'vue';
import { ledger, type MetricKernel } from '../services/analysis-ledger';
import { activeConfigHash } from '../services/analysis-config';
import type { NodeId } from '../types';

export function useKernelSeries(variationPath: Ref<NodeId[]>, kernel: MetricKernel) {
  return computed(() =>
    ledger.compute(activeConfigHash.value, variationPath.value, kernel).value.map((v, i) => [i, v])
  );
}
