import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AvailabilityHealthMonitor } from '../src/services/availabilityHealthMonitor';

function createMockStore(connections: any[] = []) {
  return {
    list: vi.fn(() => connections),
  };
}

describe('AvailabilityHealthMonitor', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('tracks failing app insights availability checks and ignores non-app-insights connections', async () => {
    const connections = [
      { id: 'app-1', displayName: 'Prod', resourceType: 'appInsights' },
      { id: 'ws-1', displayName: 'Logs', resourceType: 'logAnalytics' },
    ];
    const runQuery = vi.fn().mockResolvedValue({ rows: [{ total: 4, failing: 2 }] });
    const monitor = new AvailabilityHealthMonitor(createMockStore(connections) as any, { runQuery } as any);

    monitor.start();
    await monitor.refreshNow();

    expect(runQuery).toHaveBeenCalledTimes(2);
    expect(runQuery).toHaveBeenCalledWith(
      'app-1',
      expect.stringContaining('countif(success != 1)'),
      { range: '24h' }
    );
    expect(monitor.getState('app-1')).toMatchObject({
      hasHealthChecks: true,
      failingCount: 2,
    });
    expect(monitor.getState('ws-1')).toBeUndefined();
    expect(monitor.getTotalFailingCount()).toBe(2);

    monitor.stop();
    expect(monitor.getTotalFailingCount()).toBe(0);
  });

  it('does not count connections without availability data', async () => {
    const connections = [
      { id: 'app-2', displayName: 'Empty', resourceType: 'appInsights' },
    ];
    const runQuery = vi.fn().mockResolvedValue({ rows: [{ total: 0, failing: 0 }] });
    const monitor = new AvailabilityHealthMonitor(createMockStore(connections) as any, { runQuery } as any);

    monitor.start();
    await monitor.refreshNow();

    expect(monitor.getState('app-2')).toMatchObject({
      hasHealthChecks: false,
      failingCount: 0,
    });
    expect(monitor.getTotalFailingCount()).toBe(0);

    monitor.stop();
  });
});