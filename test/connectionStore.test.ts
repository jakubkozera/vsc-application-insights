import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectionStore } from '../src/state/connectionStore';

function createMockContext() {
  const state = new Map<string, any>();
  const secrets = new Map<string, string>();
  return {
    globalState: {
      get: vi.fn((key: string, def?: any) => state.get(key) ?? def),
      update: vi.fn(async (key: string, value: any) => { state.set(key, value); }),
    },
    secrets: {
      store: vi.fn(async (key: string, value: string) => { secrets.set(key, value); }),
      get: vi.fn(async (key: string) => secrets.get(key)),
      delete: vi.fn(async (key: string) => { secrets.delete(key); }),
    },
  } as any;
}

describe('ConnectionStore', () => {
  let store: ConnectionStore;
  let ctx: any;

  beforeEach(() => {
    ctx = createMockContext();
    store = new ConnectionStore(ctx);
  });

  it('starts with empty list', () => {
    expect(store.list()).toEqual([]);
  });

  it('adds a connection', async () => {
    const conn = await store.add({
      displayName: 'Test',
      resourceId: 'abc-123',
      resourceType: 'appInsights',
      authMode: 'aad',
    });

    expect(conn.id).toBeDefined();
    expect(conn.displayName).toBe('Test');
    expect(conn.createdAt).toBeDefined();
    expect(store.list()).toHaveLength(1);
  });

  it('adds connection with secret', async () => {
    await store.add({
      displayName: 'API Key Test',
      resourceId: 'xyz-789',
      resourceType: 'logAnalytics',
      authMode: 'apikey',
    }, 'my-api-key');

    expect(ctx.secrets.store).toHaveBeenCalled();
    const secret = await store.getSecret(store.list()[0].id);
    expect(secret).toBe('my-api-key');
  });

  it('removes a connection', async () => {
    const conn = await store.add({
      displayName: 'ToRemove',
      resourceId: 'remove-me',
      resourceType: 'appInsights',
      authMode: 'aad',
    });

    await store.remove(conn.id);
    expect(store.list()).toHaveLength(0);
  });

  it('updates a connection', async () => {
    const conn = await store.add({
      displayName: 'Original',
      resourceId: 'update-me',
      resourceType: 'appInsights',
      authMode: 'aad',
    });

    await store.update({ ...conn, displayName: 'Updated' });
    expect(store.list()[0].displayName).toBe('Updated');
  });

  it('manages active connection', async () => {
    const conn1 = await store.add({
      displayName: 'First',
      resourceId: 'first',
      resourceType: 'appInsights',
      authMode: 'aad',
    });
    const conn2 = await store.add({
      displayName: 'Second',
      resourceId: 'second',
      resourceType: 'logAnalytics',
      authMode: 'aad',
    });

    expect(store.getActiveId()).toBeUndefined();
    expect(store.getActive()?.id).toBe(conn1.id); // defaults to first

    await store.setActive(conn2.id);
    expect(store.getActiveId()).toBe(conn2.id);
    expect(store.getActive()?.id).toBe(conn2.id);
  });

  it('clears active when connection is removed', async () => {
    const conn = await store.add({
      displayName: 'Active',
      resourceId: 'active',
      resourceType: 'appInsights',
      authMode: 'aad',
    });

    await store.setActive(conn.id);
    await store.remove(conn.id);
    expect(store.getActiveId()).toBeUndefined();
  });
});
