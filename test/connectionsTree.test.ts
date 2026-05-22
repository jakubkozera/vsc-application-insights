import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectionsTreeProvider } from '../src/providers/connectionsTreeProvider';
import { ConnectionItem, FailuresItem, LogTablesFolderItem, LogTableItem, SearchItem } from '../src/providers/treeItems';

function createMockStore(connections: any[] = []) {
  const _onDidChange = { event: vi.fn(), fire: vi.fn() };
  return {
    list: vi.fn(() => connections),
    get: vi.fn((id: string) => connections.find((c: any) => c.id === id)),
    getActiveId: vi.fn(() => connections[0]?.id),
    onDidChange: vi.fn((handler: any) => {
      // Store handler for later invocation
      return { dispose: vi.fn() };
    }),
  };
}

describe('ConnectionsTreeProvider', () => {
  it('returns empty array when no connections', async () => {
    const store = createMockStore([]);
    const tree = new ConnectionsTreeProvider(store as any);
    const children = await tree.getChildren();
    expect(children).toEqual([]);
  });

  it('returns connection items at root level', async () => {
    const connections = [
      { id: 'c1', displayName: 'Production', resourceId: 'app-1', resourceType: 'appInsights', authMode: 'aad', createdAt: '2024-01-01' },
      { id: 'c2', displayName: 'Staging', resourceId: 'ws-1', resourceType: 'logAnalytics', authMode: 'apikey', createdAt: '2024-01-02' },
    ];
    const store = createMockStore(connections);
    const tree = new ConnectionsTreeProvider(store as any);

    const children = await tree.getChildren();
    expect(children).toHaveLength(2);
    expect(children[0]).toBeInstanceOf(ConnectionItem);
    expect((children[0] as ConnectionItem).meta.displayName).toBe('Production');
  });

  it('returns search, failures and log tables for a connection', async () => {
    const connections = [
      { id: 'c1', displayName: 'Prod', resourceId: 'app-1', resourceType: 'appInsights', authMode: 'aad', createdAt: '2024-01-01' },
    ];
    const store = createMockStore(connections);
    const tree = new ConnectionsTreeProvider(store as any);

    const root = await tree.getChildren();
    const connectionChildren = await tree.getChildren(root[0]);
    expect(connectionChildren).toHaveLength(3);
    expect(connectionChildren[0]).toBeInstanceOf(SearchItem);
    expect(connectionChildren[1]).toBeInstanceOf(FailuresItem);
    expect(connectionChildren[2]).toBeInstanceOf(LogTablesFolderItem);
  });

  it('returns 5 log table items under the folder', async () => {
    const connections = [
      { id: 'c1', displayName: 'Prod', resourceId: 'app-1', resourceType: 'appInsights', authMode: 'aad', createdAt: '2024-01-01' },
    ];
    const store = createMockStore(connections);
    const tree = new ConnectionsTreeProvider(store as any);

    const folder = new LogTablesFolderItem('c1');
    const tables = await tree.getChildren(folder);
    expect(tables).toHaveLength(5);
    expect(tables[0]).toBeInstanceOf(LogTableItem);

    const tableNames = tables.map(t => (t as LogTableItem).tableName);
    expect(tableNames).toContain('requests');
    expect(tableNames).toContain('exceptions');
    expect(tableNames).toContain('traces');
    expect(tableNames).toContain('dependencies');
    expect(tableNames).toContain('customEvents');
  });
});
