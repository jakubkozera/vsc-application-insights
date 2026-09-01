import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ViewPreferencesStore } from '../src/state/viewPreferencesStore';

function createMockContext() {
  const state = new Map<string, any>();
  return {
    globalState: {
      get: vi.fn((key: string, def?: any) => state.get(key) ?? def),
      update: vi.fn(async (key: string, value: any) => { state.set(key, value); }),
    },
  } as any;
}

describe('ViewPreferencesStore', () => {
  let store: ViewPreferencesStore;

  beforeEach(() => {
    const ctx = createMockContext();
    store = new ViewPreferencesStore(ctx);
  });

  it('has no remembered time range by default', () => {
    expect(store.getLastTimeRange('queryEditor')).toBeUndefined();
  });

  it('remembers the last time range for a view', async () => {
    await store.setLastTimeRange('queryEditor', { range: '3d' });
    expect(store.getLastTimeRange('queryEditor')).toEqual({ range: '3d' });
  });

  it('tracks time range independently per view', async () => {
    await store.setLastTimeRange('queryEditor', { range: '3d' });
    await store.setLastTimeRange('logTable', { range: '7d' });

    expect(store.getLastTimeRange('queryEditor')).toEqual({ range: '3d' });
    expect(store.getLastTimeRange('logTable')).toEqual({ range: '7d' });
  });

  it('overwrites the previous value for the same view', async () => {
    await store.setLastTimeRange('availability', { range: '24h' });
    await store.setLastTimeRange('availability', { range: '3d' });

    expect(store.getLastTimeRange('availability')).toEqual({ range: '3d' });
  });
});
