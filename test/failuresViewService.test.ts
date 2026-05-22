import { describe, it, expect, vi } from 'vitest';
import { FailuresViewService } from '../src/services/failuresViewService';

describe('FailuresViewService', () => {
  it('loads operations tab data and preserves selection', async () => {
    const runQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [{ timestamp: '2026-05-22T10:00:00Z', failedCount: 5, totalCount: 20 }] })
      .mockResolvedValueOnce({ rows: [{ item: 'GET /api/orders', failedCount: 7, totalCount: 30 }] })
      .mockResolvedValueOnce({ rows: [{ item: '500', count: 4 }] })
      .mockResolvedValueOnce({ rows: [{ item: 'System.Exception', count: 2 }] })
      .mockResolvedValueOnce({ rows: [{ item: 'sql-prod', count: 3 }] });

    const service = new FailuresViewService({ runQuery } as any);
    const data = await service.load('conn-1', {
      tab: 'operations',
      timeRange: { range: '24h' },
      selection: { from: '2026-05-22T09:45:00Z', to: '2026-05-22T10:15:00Z' },
      selectedKey: 'GET /api/orders'
    });

    expect(data.tab).toBe('operations');
    expect(data.chart).toHaveLength(1);
    expect(data.rows[0].label).toBe('GET /api/orders');
    expect(data.selectedKey).toBe('GET /api/orders');
    expect(data.cards).toHaveLength(3);
    expect(data.cards[0].items[0].label).toBe('500');
    expect(runQuery).toHaveBeenCalledTimes(5);
    expect(runQuery).toHaveBeenCalledWith(
      'conn-1',
      expect.stringContaining("timestamp between (datetime('2026-05-22T09:45:00Z') .. datetime('2026-05-22T10:15:00Z'))"),
      { range: '24h' }
    );
  });
});