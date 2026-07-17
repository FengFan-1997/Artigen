import type { FormatFactoryRunStatus } from '../../composables/useFormatFactory';

export const trafficTypeForFormatFactoryRun = (
  status: FormatFactoryRunStatus
): 'generate_success' | 'generate_fail' | null => {
  if (status === 'success') return 'generate_success';
  if (status === 'failed') return 'generate_fail';
  return null;
};
