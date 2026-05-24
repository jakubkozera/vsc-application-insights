import { TimeRangeValue } from '../models/connection';
import { QueryService } from './queryService';

export type FailuresTab = 'operations' | 'dependencies' | 'exceptions' | 'roles';

export interface FailuresSelection {
  from: string;
  to: string;
}

export interface FailuresRequest {
  tab: FailuresTab;
  timeRange: TimeRangeValue;
  selection?: FailuresSelection;
  selectedKey?: string;
}

export interface FailuresChartPoint {
  timestamp: string;
  failedCount: number;
  totalCount: number;
}

export interface FailuresListRow {
  key: string;
  label: string;
  failedCount: number;
  totalCount: number;
  failureRate: number;
}

export interface FailuresCardItem {
  label: string;
  count: number;
}

export interface FailuresCard {
  title: string;
  items: FailuresCardItem[];
  emptyText: string;
}

export interface FailuresTotals {
  failedCount: number;
  totalCount: number;
}

export interface FailuresViewData {
  tab: FailuresTab;
  chart: FailuresChartPoint[];
  rows: FailuresListRow[];
  selectedKey?: string;
  selectedLabel?: string;
  cards: FailuresCard[];
  totals: FailuresTotals;
  appliedSelection?: FailuresSelection;
}

const EMPTY_TEXT = '(empty)';

export class FailuresViewService {
  constructor(private readonly queryService: QueryService) {}

  async load(connectionId: string, request: FailuresRequest): Promise<FailuresViewData> {
    const overviewWhere = buildWhereClause(request.timeRange);
    const bucket = getBucketSize(request.timeRange);

    const chart = await this.loadChart(connectionId, request.tab, overviewWhere, request.timeRange, bucket);
    const effectiveSelection = request.selection ?? getDefaultSelection(chart);
    const effectiveWhere = buildWhereClause(request.timeRange, effectiveSelection);
    const rows = await this.loadRows(connectionId, request.tab, effectiveWhere, request.timeRange);
    const selected = selectRow(rows, request.selectedKey);
    const cards = selected
      ? await this.loadCards(connectionId, request.tab, effectiveWhere, request.timeRange, selected.key)
      : emptyCards(request.tab);

    const totals = chart.reduce<FailuresTotals>((acc, point) => {
      acc.failedCount += point.failedCount;
      acc.totalCount += point.totalCount;
      return acc;
    }, { failedCount: 0, totalCount: 0 });

    return {
      tab: request.tab,
      chart,
      rows,
      selectedKey: selected?.key,
      selectedLabel: selected?.label,
      cards,
      totals,
      appliedSelection: effectiveSelection,
    };
  }

  private async loadChart(connectionId: string, tab: FailuresTab, whereClause: string, timeRange: TimeRangeValue, bucket: string): Promise<FailuresChartPoint[]> {
    const query = buildChartQuery(tab, whereClause, bucket);
    const result = await this.queryService.runQuery(connectionId, query, timeRange);
    return result.rows
      .map(row => ({
        timestamp: toString(row.timestamp),
        failedCount: toNumber(row.failedCount),
        totalCount: toNumber(row.totalCount),
      }))
      .filter(point => point.timestamp);
  }

  private async loadRows(connectionId: string, tab: FailuresTab, whereClause: string, timeRange: TimeRangeValue): Promise<FailuresListRow[]> {
    const query = buildRowsQuery(tab, whereClause);
    const result = await this.queryService.runQuery(connectionId, query, timeRange);
    return result.rows.map(row => {
      const failedCount = toNumber(row.failedCount);
      const totalCount = Math.max(toNumber(row.totalCount), failedCount);
      return {
        key: toString(row.item),
        label: toString(row.item),
        failedCount,
        totalCount,
        failureRate: totalCount > 0 ? failedCount / totalCount : 0,
      };
    });
  }

  private async loadCards(connectionId: string, tab: FailuresTab, whereClause: string, timeRange: TimeRangeValue, selectedKey: string): Promise<FailuresCard[]> {
    const queries = buildCardsQueries(tab, whereClause, selectedKey);
    const cards: FailuresCard[] = [];
    for (const card of queries) {
      const result = await this.queryService.runQuery(connectionId, card.query, timeRange);
      cards.push({
        title: card.title,
        emptyText: card.emptyText,
        items: result.rows.map(row => ({
          label: toString(row.item),
          count: toNumber(row.count),
        }))
      });
    }
    return cards;
  }
}

function buildChartQuery(tab: FailuresTab, whereClause: string, bucket: string): string {
  switch (tab) {
    case 'dependencies':
      return [
        'dependencies',
        `| where ${whereClause}`,
        `| summarize failedCount = countif(success == false), totalCount = count() by timestamp = bin(timestamp, ${bucket})`,
        '| order by timestamp asc'
      ].join('\n');
    case 'exceptions':
      return [
        'exceptions',
        `| where ${whereClause}`,
        `| summarize failedCount = count(), totalCount = count() by timestamp = bin(timestamp, ${bucket})`,
        '| order by timestamp asc'
      ].join('\n');
    case 'operations':
    case 'roles':
    default:
      return [
        'requests',
        `| where ${whereClause}`,
        `| summarize failedCount = countif(success == false), totalCount = count() by timestamp = bin(timestamp, ${bucket})`,
        '| order by timestamp asc'
      ].join('\n');
  }
}

function buildRowsQuery(tab: FailuresTab, whereClause: string): string {
  switch (tab) {
    case 'dependencies':
      return [
        'dependencies',
        `| where ${whereClause}`,
        `| extend dependencyLabel = ${dependencyLabelExpr()}`,
        '| summarize failedCount = countif(success == false), totalCount = count() by item = dependencyLabel',
        '| where failedCount > 0',
        '| order by failedCount desc, totalCount desc',
        '| take 200'
      ].join('\n');
    case 'exceptions':
      return [
        'exceptions',
        `| where ${whereClause}`,
        `| extend exceptionType = ${stringFieldExpr('type')}`,
        '| summarize failedCount = count(), totalCount = count() by item = exceptionType',
        '| order by failedCount desc',
        '| take 200'
      ].join('\n');
    case 'roles':
      return [
        'requests',
        `| where ${whereClause}`,
        `| extend roleName = ${stringFieldExpr('cloud_RoleName')}`,
        '| summarize failedCount = countif(success == false), totalCount = count() by item = roleName',
        '| where failedCount > 0',
        '| order by failedCount desc, totalCount desc',
        '| take 200'
      ].join('\n');
    case 'operations':
    default:
      return [
        'requests',
        `| where ${whereClause}`,
        `| extend operationName = ${stringFieldExpr('name')}`,
        '| summarize failedCount = countif(success == false), totalCount = count() by item = operationName',
        '| where failedCount > 0',
        '| order by failedCount desc, totalCount desc',
        '| take 200'
      ].join('\n');
  }
}

function buildCardsQueries(tab: FailuresTab, whereClause: string, selectedKey: string): Array<{ title: string; emptyText: string; query: string }> {
  const key = escapeKqlString(selectedKey);
  switch (tab) {
    case 'dependencies':
      return [
        {
          title: 'Top 3 result codes',
          emptyText: 'No failed responses in range',
          query: [
            'dependencies',
            `| where ${whereClause}`,
            `| extend dependencyLabel = ${dependencyLabelExpr()}`,
            `| where dependencyLabel == '${key}' and success == false`,
            `| summarize count = count() by item = ${stringFieldExpr('resultCode')}`,
            '| top 3 by count'
          ].join('\n')
        },
        {
          title: 'Top 3 calling operations',
          emptyText: 'No calling operations in range',
          query: [
            'dependencies',
            `| where ${whereClause}`,
            `| extend dependencyLabel = ${dependencyLabelExpr()}`,
            `| where dependencyLabel == '${key}' and success == false`,
            `| summarize count = count() by item = ${stringFieldExpr('operation_Name')}`,
            '| top 3 by count'
          ].join('\n')
        },
        {
          title: 'Top 3 roles',
          emptyText: 'No roles in range',
          query: [
            'dependencies',
            `| where ${whereClause}`,
            `| extend dependencyLabel = ${dependencyLabelExpr()}`,
            `| where dependencyLabel == '${key}' and success == false`,
            `| summarize count = count() by item = ${stringFieldExpr('cloud_RoleName')}`,
            '| top 3 by count'
          ].join('\n')
        }
      ];
    case 'exceptions':
      return [
        {
          title: 'Top 3 problem ids',
          emptyText: 'No problem ids in range',
          query: [
            'exceptions',
            `| where ${whereClause}`,
            `| where ${stringFieldExpr('type')} == '${key}'`,
            `| summarize count = count() by item = ${stringFieldExpr('problemId')}`,
            '| top 3 by count'
          ].join('\n')
        },
        {
          title: 'Top 3 operations',
          emptyText: 'No operations in range',
          query: [
            'exceptions',
            `| where ${whereClause}`,
            `| where ${stringFieldExpr('type')} == '${key}'`,
            `| summarize count = count() by item = ${stringFieldExpr('operation_Name')}`,
            '| top 3 by count'
          ].join('\n')
        },
        {
          title: 'Top 3 roles',
          emptyText: 'No roles in range',
          query: [
            'exceptions',
            `| where ${whereClause}`,
            `| where ${stringFieldExpr('type')} == '${key}'`,
            `| summarize count = count() by item = ${stringFieldExpr('cloud_RoleName')}`,
            '| top 3 by count'
          ].join('\n')
        }
      ];
    case 'roles':
      return [
        {
          title: 'Top 3 failed operations',
          emptyText: 'No failed operations in range',
          query: [
            'requests',
            `| where ${whereClause}`,
            `| where ${stringFieldExpr('cloud_RoleName')} == '${key}' and success == false`,
            `| summarize count = count() by item = ${stringFieldExpr('name')}`,
            '| top 3 by count'
          ].join('\n')
        },
        {
          title: 'Top 3 exception types',
          emptyText: 'No exceptions in range',
          query: [
            'exceptions',
            `| where ${whereClause}`,
            `| where ${stringFieldExpr('cloud_RoleName')} == '${key}'`,
            `| summarize count = count() by item = ${stringFieldExpr('type')}`,
            '| top 3 by count'
          ].join('\n')
        },
        {
          title: 'Top 3 failed dependencies',
          emptyText: 'No failed dependencies in range',
          query: [
            'dependencies',
            `| where ${whereClause}`,
            `| where ${stringFieldExpr('cloud_RoleName')} == '${key}' and success == false`,
            `| extend dependencyLabel = ${dependencyLabelExpr()}`,
            '| summarize count = count() by item = dependencyLabel',
            '| top 3 by count'
          ].join('\n')
        }
      ];
    case 'operations':
    default:
      return [
        {
          title: 'Top 3 response codes',
          emptyText: 'No failed responses in range',
          query: [
            'requests',
            `| where ${whereClause}`,
            `| where ${stringFieldExpr('name')} == '${key}' and success == false`,
            `| summarize count = count() by item = ${stringFieldExpr('resultCode')}`,
            '| top 3 by count'
          ].join('\n')
        },
        {
          title: 'Top 3 exception types',
          emptyText: 'No exceptions in range',
          query: [
            'exceptions',
            `| where ${whereClause}`,
            `| where ${stringFieldExpr('operation_Name')} == '${key}'`,
            `| summarize count = count() by item = ${stringFieldExpr('type')}`,
            '| top 3 by count'
          ].join('\n')
        },
        {
          title: 'Top 3 failed dependencies',
          emptyText: 'No failed dependencies in range',
          query: [
            'dependencies',
            `| where ${whereClause}`,
            `| where ${stringFieldExpr('operation_Name')} == '${key}' and success == false`,
            `| extend dependencyLabel = ${dependencyLabelExpr()}`,
            '| summarize count = count() by item = dependencyLabel',
            '| top 3 by count'
          ].join('\n')
        }
      ];
  }
}

function buildWhereClause(timeRange: TimeRangeValue, selection?: FailuresSelection): string {
  if (selection?.from && selection?.to) {
    return `timestamp between (datetime('${escapeKqlString(selection.from)}') .. datetime('${escapeKqlString(selection.to)}'))`;
  }

  switch (timeRange.range) {
    case '30m': return 'timestamp > ago(30m)';
    case '1h': return 'timestamp > ago(1h)';
    case '6h': return 'timestamp > ago(6h)';
    case '24h': return 'timestamp > ago(24h)';
    case '7d': return 'timestamp > ago(7d)';
    case 'custom':
      if (timeRange.from && timeRange.to) {
        return `timestamp between (datetime('${escapeKqlString(timeRange.from)}') .. datetime('${escapeKqlString(timeRange.to)}'))`;
      }
      return 'timestamp > ago(6h)';
    default:
      return 'timestamp > ago(6h)';
  }
}

function getBucketSize(timeRange: TimeRangeValue): string {
  switch (timeRange.range) {
    case '30m': return '1m';
    case '1h': return '2m';
    case '6h': return '5m';
    case '24h': return '15m';
    case '7d': return '1h';
    case 'custom': return '5m';
    default: return '5m';
  }
}

function getDefaultSelection(chart: FailuresChartPoint[]): FailuresSelection | undefined {
  if (chart.length === 0) return undefined;
  const window = getDefaultSelectionWindow(chart.length);
  const start = chart[window.startIndex];
  const end = chart[window.endIndex];
  if (!start || !end) return undefined;
  return { from: start.timestamp, to: end.timestamp };
}

function getDefaultSelectionWindow(length: number): { startIndex: number; endIndex: number } {
  if (length <= 1) return { startIndex: 0, endIndex: 0 };
  const visiblePoints = Math.max(8, Math.floor(length * 0.25));
  return { startIndex: Math.max(0, length - visiblePoints), endIndex: length - 1 };
}

function emptyCards(tab: FailuresTab): FailuresCard[] {
  return buildCardsQueries(tab, 'true', EMPTY_TEXT).map(card => ({
    title: card.title,
    emptyText: card.emptyText,
    items: []
  }));
}

function selectRow(rows: FailuresListRow[], selectedKey?: string): FailuresListRow | undefined {
  if (selectedKey) {
    const existing = rows.find(row => row.key === selectedKey);
    if (existing) return existing;
  }
  return rows[0];
}

function toString(value: unknown): string {
  const text = String(value ?? '').trim();
  return text || EMPTY_TEXT;
}

function toNumber(value: unknown): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function escapeKqlString(value: string): string {
  return value.replace(/'/g, "''");
}

function stringFieldExpr(field: string): string {
  return `iff(isempty(tostring(${field})), '${EMPTY_TEXT}', tostring(${field}))`;
}

function dependencyLabelExpr(): string {
  return `iff(isempty(tostring(target)), iff(isempty(tostring(name)), '${EMPTY_TEXT}', tostring(name)), tostring(target))`;
}