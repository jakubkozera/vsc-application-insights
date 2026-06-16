import { TimeRangeValue } from '../models/connection';
import { QueryService } from './queryService';

export interface AvailabilityTestResult {
  testName: string;
  availability20m: number; // -1 = no data in last 20 min
  availabilityPct: number;
  avgDurationMs: number;
  lastTimestamp: string;
  successCount: number;
  failedCount: number;
  totalCount: number;
}

export interface AvailabilityChartPoint {
  timestamp: string;
  availabilityPct: number;
  successCount: number;
  totalCount: number;
}

export interface AvailabilityViewData {
  tests: AvailabilityTestResult[];
  totalSuccessful: number;
  totalFailed: number;
  chart: AvailabilityChartPoint[];         // overall chart (all tests)
  selectedTestName?: string;
  selectedChart?: AvailabilityChartPoint[]; // chart for selected test
}

export class AvailabilityService {
  constructor(private readonly queryService: QueryService) {}

  async load(connectionId: string, timeRange: TimeRangeValue, selectedTestName?: string): Promise<AvailabilityViewData> {
    const whereClause = buildWhereClause(timeRange);
    const bucket = getBucketSize(timeRange);

    const [testsResult, overallChart] = await Promise.all([
      this.loadTests(connectionId, timeRange),
      this.loadChart(connectionId, whereClause, bucket, timeRange),
    ]);

    let selectedChart: AvailabilityChartPoint[] | undefined;
    if (selectedTestName) {
      selectedChart = await this.loadChart(connectionId, whereClause, bucket, timeRange, selectedTestName);
    }

    const totalSuccessful = testsResult.reduce((sum, t) => sum + t.successCount, 0);
    const totalFailed = testsResult.reduce((sum, t) => sum + t.failedCount, 0);

    return {
      tests: testsResult,
      totalSuccessful,
      totalFailed,
      chart: overallChart,
      selectedTestName,
      selectedChart,
    };
  }

  private async loadTests(connectionId: string, timeRange: TimeRangeValue): Promise<AvailabilityTestResult[]> {
    const whereClause = buildWhereClause(timeRange);
    const kql = `
let window20m = now() - 20m;
availabilityResults
| where ${whereClause}
| summarize
    total = count(),
    successCount = countif(success == 1),
    total20m = countif(timestamp >= window20m),
    success20m = countif(success == 1 and timestamp >= window20m),
    avgDurationMs = avg(duration),
    lastTimestamp = max(timestamp)
    by name
| extend
    availabilityPct = iif(total > 0, round(todouble(successCount) / todouble(total) * 100, 2), 0.0),
    availability20m = iif(total20m > 0, round(todouble(success20m) / todouble(total20m) * 100, 2), real(-1)),
    failedCount = total - successCount
| project
    testName = name,
    availability20m,
    availabilityPct,
    avgDurationMs,
    lastTimestamp,
    successCount,
    failedCount,
    total
| order by testName asc`.trim();

    const result = await this.queryService.runQuery(connectionId, kql, timeRange);
    return result.rows.map(row => ({
      testName: String(row['testName'] ?? ''),
      availability20m: Number(row['availability20m'] ?? -1),
      availabilityPct: Number(row['availabilityPct'] ?? 0),
      avgDurationMs: Number(row['avgDurationMs'] ?? 0),
      lastTimestamp: String(row['lastTimestamp'] ?? ''),
      successCount: Number(row['successCount'] ?? 0),
      failedCount: Number(row['failedCount'] ?? 0),
      totalCount: Number(row['total'] ?? 0),
    }));
  }

  private async loadChart(
    connectionId: string,
    whereClause: string,
    bucket: string,
    timeRange: TimeRangeValue,
    testName?: string
  ): Promise<AvailabilityChartPoint[]> {
    const testFilter = testName
      ? `| where name == '${escapeKql(testName)}'`
      : '';
    const kql = `
availabilityResults
| where ${whereClause}
${testFilter}
| summarize
    successCount = countif(success == 1),
    totalCount = count()
    by timestamp = bin(timestamp, ${bucket})
| extend availabilityPct = iif(totalCount > 0, round(todouble(successCount) / todouble(totalCount) * 100, 2), 0.0)
| project timestamp, availabilityPct, successCount, totalCount
| order by timestamp asc`.trim();

    const result = await this.queryService.runQuery(connectionId, kql, timeRange);
    return result.rows
      .map(row => ({
        timestamp: String(row['timestamp'] ?? ''),
        availabilityPct: Number(row['availabilityPct'] ?? 0),
        successCount: Number(row['successCount'] ?? 0),
        totalCount: Number(row['totalCount'] ?? 0),
      }))
      .filter(p => p.timestamp);
  }
}

function escapeKql(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function buildWhereClause(timeRange: TimeRangeValue): string {
  switch (timeRange.range) {
    case '30m': return 'timestamp > ago(30m)';
    case '1h':  return 'timestamp > ago(1h)';
    case '6h':  return 'timestamp > ago(6h)';
    case '24h': return 'timestamp > ago(24h)';
    case '7d':  return 'timestamp > ago(7d)';
    default:    return 'timestamp > ago(24h)';
  }
}

function getBucketSize(timeRange: TimeRangeValue): string {
  switch (timeRange.range) {
    case '30m': return '1m';
    case '1h':  return '2m';
    case '6h':  return '5m';
    case '24h': return '15m';
    case '7d':  return '1h';
    default:    return '15m';
  }
}
