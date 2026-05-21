import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryService } from '../src/services/queryService';

function createMockConnectionStore() {
  const connections = new Map<string, any>();
  return {
    get: vi.fn((id: string) => connections.get(id)),
    list: vi.fn(() => [...connections.values()]),
    getSecret: vi.fn(async () => 'test-key'),
    touchLastUsed: vi.fn(),
    _add: (meta: any) => { connections.set(meta.id, meta); },
  };
}

function createMockClientFactory(mockResult: any) {
  return {
    getLogsClient: vi.fn(async () => ({
      queryWorkspace: vi.fn(async () => mockResult),
    })),
    getApiKey: vi.fn(async () => 'test-api-key'),
  };
}

describe('QueryService', () => {
  it('runs a table query and returns mapped results', async () => {
    const store = createMockConnectionStore();
    store._add({
      id: 'conn-1',
      displayName: 'Test',
      resourceId: 'ws-123',
      resourceType: 'logAnalytics',
      authMode: 'aad',
    });

    const mockResult = {
      status: 'Success',
      tables: [{
        columnDescriptors: [
          { name: 'timestamp', type: 'datetime' },
          { name: 'name', type: 'string' },
          { name: 'resultCode', type: 'int' },
        ],
        rows: [
          ['2024-01-01T00:00:00Z', 'GET /api/users', 200],
          ['2024-01-01T00:01:00Z', 'POST /api/orders', 500],
        ]
      }]
    };

    const factory = createMockClientFactory(mockResult);
    const service = new QueryService(store as any, factory as any);

    const result = await service.runTableQuery('conn-1', 'requests', { range: '1h' });

    expect(result.columns).toHaveLength(3);
    expect(result.columns[0].name).toBe('timestamp');
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].name).toBe('GET /api/users');
    expect(result.rows[1].resultCode).toBe(500);
    expect(result.statistics?.rowCount).toBe(2);
    expect(result.statistics?.executionTime).toBeGreaterThanOrEqual(0);
  });

  it('returns empty result for no tables', async () => {
    const store = createMockConnectionStore();
    store._add({
      id: 'conn-2',
      displayName: 'Empty',
      resourceId: 'ws-empty',
      resourceType: 'logAnalytics',
      authMode: 'aad',
    });

    const mockResult = {
      status: 'Success',
      tables: []
    };

    const factory = createMockClientFactory(mockResult);
    const service = new QueryService(store as any, factory as any);

    const result = await service.runQuery('conn-2', 'requests | take 10', { range: '30m' });

    expect(result.columns).toHaveLength(0);
    expect(result.rows).toHaveLength(0);
    expect(result.statistics?.rowCount).toBe(0);
  });

  it('throws on failed query', async () => {
    const store = createMockConnectionStore();
    store._add({
      id: 'conn-3',
      displayName: 'Fail',
      resourceId: 'ws-fail',
      resourceType: 'logAnalytics',
      authMode: 'aad',
    });

    const mockResult = {
      status: 'Failed',
      tables: []
    };

    const factory = createMockClientFactory(mockResult);
    const service = new QueryService(store as any, factory as any);

    await expect(service.runQuery('conn-3', 'bad query', { range: '1h' }))
      .rejects.toThrow('Query failed');
  });

  it('throws for unknown connection', async () => {
    const store = createMockConnectionStore();
    const factory = createMockClientFactory({});
    const service = new QueryService(store as any, factory as any);

    await expect(service.runQuery('nonexistent', 'requests', { range: '1h' }))
      .rejects.toThrow('Connection not found');
  });
});
