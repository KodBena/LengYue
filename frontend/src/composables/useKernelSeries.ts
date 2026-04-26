/**
 * src/composables/useKernelSeries.ts
 * Projects a single MetricKernel over an anchored variation path.
 */
import { computed, type Ref } from 'vue';
import { ledger, type MetricKernel } from '../services/analysis-ledger';
import { activeConfigHash } from '../services/analysis-config';

export function useKernelSeries(variationPath: Ref<string[]>, kernel: MetricKernel) {
  return computed(() =>
    ledger.compute(activeConfigHash.value, variationPath.value as any, kernel).value.map((v, i) => [i, v])
  );
}
