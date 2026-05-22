import { describe, expect, it } from 'vitest';
import { applyColumnFilters, matchesFilter } from '../src/shared/utils/columnFiltering';

describe('columnFiltering', () => {
  it('filters datetime values with the date-aware operators', () => {
    expect(matchesFilter('2026-05-22T12:02:22.1027986Z', { op: 'after', value: '2026-05-22T12:00:00Z' }, 'date')).toBe(true);
    expect(matchesFilter('2026-05-22T11:59:22.1027986Z', { op: 'after', value: '2026-05-22T12:00:00Z' }, 'date')).toBe(false);
    expect(matchesFilter('2026-05-22T12:00:24.0000000Z', { op: 'equals', value: '2026-05-22T12:00:00Z' }, 'date')).toBe(true);
  });

  it('filters text values by the selected checkbox values', () => {
    const rows = [
      { source: 'api', status: 'ok' },
      { source: 'worker', status: 'ok' },
      { source: 'portal', status: 'fail' },
    ];

    const filtered = applyColumnFilters(
      rows,
      [{ name: 'source', type: 'string' }, { name: 'status', type: 'string' }],
      { source: { op: 'contains', value: '', selectedValues: ['api', 'portal'] } },
    );

    expect(filtered).toEqual([
      { source: 'api', status: 'ok' },
      { source: 'portal', status: 'fail' },
    ]);
  });
});