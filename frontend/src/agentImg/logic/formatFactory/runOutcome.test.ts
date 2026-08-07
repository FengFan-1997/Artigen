import { describe, expect, it } from 'vitest';
import { trafficTypeForFormatFactoryRun } from './runOutcome';

describe('Format Factory analytics outcome', () => {
  it('never classifies cancellation or supersession as success', () => {
    expect(trafficTypeForFormatFactoryRun('success')).toBe('generate_success');
    expect(trafficTypeForFormatFactoryRun('failed')).toBe('generate_fail');
    expect(trafficTypeForFormatFactoryRun('cancelled')).toBeNull();
    expect(trafficTypeForFormatFactoryRun('superseded')).toBeNull();
  });
});
