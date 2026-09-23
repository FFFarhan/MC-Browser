import { describe, expect, it, vi } from 'vitest';
import { readResourceEstimate } from './ResourceEstimate';

describe('browser resource estimates', () => {
  it('reports supported heap and origin storage measurements without inventing process memory', async () => {
    const browserNavigator = {
      storage: { estimate: vi.fn(async () => ({ usage: 1_024, quota: 8_192 })) },
    } as unknown as Navigator;
    const browserPerformance = {
      memory: { usedJSHeapSize: 2_048, totalJSHeapSize: 4_096, jsHeapSizeLimit: 16_384 },
    } as unknown as Performance;

    await expect(readResourceEstimate(browserNavigator, browserPerformance)).resolves.toMatchObject(
      {
        javascriptHeap: {
          availability: 'available',
          usedBytes: 2_048,
          totalBytes: 4_096,
          limitBytes: 16_384,
        },
        originStorage: { availability: 'available', usageBytes: 1_024, quotaBytes: 8_192 },
        buildAssets: { availability: 'measured-outside-browser', bytes: null },
        processRss: { availability: 'not-exposed-by-page', bytes: null },
      },
    );
  });

  it('marks unsupported browser APIs distinctly from real zero usage', async () => {
    const browserNavigator = {} as Navigator;
    const browserPerformance = {} as Performance;
    await expect(readResourceEstimate(browserNavigator, browserPerformance)).resolves.toMatchObject(
      {
        javascriptHeap: { availability: 'unsupported', usedBytes: null },
        originStorage: { availability: 'unsupported', usageBytes: null, quotaBytes: null },
        processRss: { availability: 'not-exposed-by-page', bytes: null },
      },
    );
  });

  it('marks a failed storage estimate as unavailable instead of zero', async () => {
    const browserNavigator = {
      storage: { estimate: vi.fn(async () => Promise.reject(new Error('blocked'))) },
    } as unknown as Navigator;
    const estimate = await readResourceEstimate(browserNavigator, {} as Performance);
    expect(estimate.originStorage).toEqual({
      availability: 'unavailable',
      usageBytes: null,
      quotaBytes: null,
    });
  });
});
