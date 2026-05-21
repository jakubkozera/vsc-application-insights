import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryStore } from '../src/state/queryStore';

function createMockContext() {
  const state = new Map<string, any>();
  return {
    globalState: {
      get: vi.fn((key: string, def?: any) => state.get(key) ?? def),
      update: vi.fn(async (key: string, value: any) => { state.set(key, value); }),
    },
    secrets: {
      store: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
    },
  } as any;
}

describe('QueryStore', () => {
  let store: QueryStore;

  beforeEach(() => {
    const ctx = createMockContext();
    store = new QueryStore(ctx);
  });

  it('starts with empty list', () => {
    expect(store.list()).toEqual([]);
  });

  it('adds a query', async () => {
    const query = await store.add('Test Query', 'requests | take 10', 'conn-1');
    expect(query.id).toBeDefined();
    expect(query.name).toBe('Test Query');
    expect(query.kql).toBe('requests | take 10');
    expect(query.connectionId).toBe('conn-1');
    expect(store.list()).toHaveLength(1);
  });

  it('removes a query', async () => {
    const query = await store.add('ToRemove', 'traces | take 5');
    await store.remove(query.id);
    expect(store.list()).toHaveLength(0);
  });

  it('updates a query', async () => {
    const query = await store.add('Original', 'requests | take 10');
    await store.update({ ...query, name: 'Updated', kql: 'exceptions | take 20' });
    const updated = store.get(query.id);
    expect(updated?.name).toBe('Updated');
    expect(updated?.kql).toBe('exceptions | take 20');
  });

  it('gets a query by id', async () => {
    const query = await store.add('Find Me', 'dependencies | take 10');
    expect(store.get(query.id)?.name).toBe('Find Me');
    expect(store.get('nonexistent')).toBeUndefined();
  });

  it('fires onDidChange events', async () => {
    const handler = vi.fn();
    store.onDidChange(handler);
    await store.add('Trigger', 'traces');
    expect(handler).toHaveBeenCalledTimes(1);
    const q = store.list()[0];
    await store.remove(q.id);
    expect(handler).toHaveBeenCalledTimes(2);
  });
});
