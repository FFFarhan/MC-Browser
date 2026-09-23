export type MeasurementAvailability = 'available' | 'unsupported' | 'unavailable';

export interface BrowserResourceEstimate {
  readonly javascriptHeap: {
    readonly availability: MeasurementAvailability;
    readonly usedBytes: number | null;
    readonly totalBytes: number | null;
    readonly limitBytes: number | null;
  };
  readonly originStorage: {
    readonly availability: MeasurementAvailability;
    readonly usageBytes: number | null;
    readonly quotaBytes: number | null;
  };
  readonly buildAssets: {
    readonly availability: 'measured-outside-browser';
    readonly bytes: null;
  };
  readonly processRss: {
    readonly availability: 'not-exposed-by-page';
    readonly bytes: null;
  };
}

interface PerformanceMemoryInfo {
  readonly usedJSHeapSize?: number;
  readonly totalJSHeapSize?: number;
  readonly jsHeapSizeLimit?: number;
}

interface PerformanceWithMemory extends Performance {
  readonly memory?: PerformanceMemoryInfo;
}

interface StorageEstimateLike {
  readonly usage?: number;
  readonly quota?: number;
}

interface StorageManagerWithEstimate {
  estimate?: () => Promise<StorageEstimateLike>;
}

interface NavigatorWithStorageEstimate {
  readonly storage?: StorageManagerWithEstimate;
}

function validByteCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export async function readResourceEstimate(
  browserNavigator: Navigator,
  browserPerformance: Performance,
): Promise<BrowserResourceEstimate> {
  const memory = (browserPerformance as PerformanceWithMemory).memory;
  const heapValues = {
    usedBytes: validByteCount(memory?.usedJSHeapSize),
    totalBytes: validByteCount(memory?.totalJSHeapSize),
    limitBytes: validByteCount(memory?.jsHeapSizeLimit),
  };
  const javascriptHeap: BrowserResourceEstimate['javascriptHeap'] = {
    availability: memory ? 'available' : 'unsupported',
    ...heapValues,
  };

  const storage = (browserNavigator as unknown as NavigatorWithStorageEstimate).storage;
  if (typeof storage?.estimate !== 'function') {
    return {
      javascriptHeap,
      originStorage: { availability: 'unsupported', usageBytes: null, quotaBytes: null },
      buildAssets: { availability: 'measured-outside-browser', bytes: null },
      processRss: { availability: 'not-exposed-by-page', bytes: null },
    };
  }

  try {
    const estimate: StorageEstimateLike = await storage.estimate();
    const usageBytes = validByteCount(estimate.usage);
    const quotaBytes = validByteCount(estimate.quota);
    return {
      javascriptHeap,
      originStorage: {
        availability: usageBytes === null && quotaBytes === null ? 'unavailable' : 'available',
        usageBytes,
        quotaBytes,
      },
      buildAssets: { availability: 'measured-outside-browser', bytes: null },
      processRss: { availability: 'not-exposed-by-page', bytes: null },
    };
  } catch {
    return {
      javascriptHeap,
      originStorage: { availability: 'unavailable', usageBytes: null, quotaBytes: null },
      buildAssets: { availability: 'measured-outside-browser', bytes: null },
      processRss: { availability: 'not-exposed-by-page', bytes: null },
    };
  }
}
