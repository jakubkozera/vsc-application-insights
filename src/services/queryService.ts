import { LogsQueryClient, type LogsTable } from '@azure/monitor-query';
import { QueryResult, QueryColumn, TimeRangeValue } from '../models/connection';
import { ConnectionStore } from '../state/connectionStore';
import { ClientFactory } from './clientFactory';
import { Logger } from '../logging/logger';
import https from 'https';

export class QueryService {
  constructor(
    private readonly store: ConnectionStore,
    private readonly factory: ClientFactory
  ) {}

  async runQuery(connectionId: string, kql: string, timeRange: TimeRangeValue): Promise<QueryResult> {
    const meta = this.store.get(connectionId);
    if (!meta) throw new Error('Connection not found');

    Logger.info(`[QueryService] Running query on "${meta.displayName}" (${meta.authMode}, ${meta.resourceType})`);
    Logger.info(`[QueryService] KQL: ${kql.substring(0, 120)}`);
    Logger.info(`[QueryService] Resource ID: "${meta.resourceId}", TimeRange: ${timeRange.range}`);

    const startTime = Date.now();

    try {
      if (meta.authMode === 'apikey') {
        // API key auth — call REST API directly with x-api-key header
        const apiKey = await this.factory.getApiKey(connectionId);
        if (!apiKey) throw new Error('Missing API key');
        return await this.queryWithApiKey(meta.resourceId, apiKey, kql, timeRange);
      } else {
        // AAD auth — use the SDK's queryWorkspace (works for both App Insights and Log Analytics)
        const client = await this.factory.getLogsClient(connectionId);
        const duration = this.toDuration(timeRange);

        Logger.info(`[QueryService] Using SDK queryWorkspace, duration: ${duration}`);
        const result = await client.queryWorkspace(meta.resourceId, kql, { duration });

        const executionTime = Date.now() - startTime;
        Logger.info(`[QueryService] SDK response status: ${result.status}, tables: ${result.tables?.length}`);

        if (result.status === 'Failed' || result.status === 'PartialFailure') {
          const errInfo = JSON.stringify((result as any).error ?? result.status);
          Logger.error('[QueryService] Query failed', errInfo);
          throw new Error(`Query failed: ${errInfo}`);
        }

        const table = result.tables[0];
        if (!table) {
          return { columns: [], rows: [], statistics: { executionTime, rowCount: 0 } };
        }
        return this.mapTable(table, executionTime);
      }
    } catch (e: any) {
      Logger.error('[QueryService] Error', e.message);
      throw e;
    }
  }

  async runTableQuery(connectionId: string, tableName: string, timeRange: TimeRangeValue, top: number = 50): Promise<QueryResult> {
    const kql = `${tableName} | top ${top} by timestamp desc`;
    return this.runQuery(connectionId, kql, timeRange);
  }

  /**
   * Query Application Insights via REST API using API key.
   * https://api.applicationinsights.io/v1/apps/{appId}/query
   */
  private async queryWithApiKey(appId: string, apiKey: string, kql: string, timeRange: TimeRangeValue): Promise<QueryResult> {
    const timespan = this.toDuration(timeRange);
    const url = `https://api.applicationinsights.io/v1/apps/${encodeURIComponent(appId)}/query`;
    const body = JSON.stringify({ query: kql, timespan });

    Logger.info(`[QueryService] REST: POST ${url}`);
    Logger.info(`[QueryService] REST body: ${body.substring(0, 200)}`);

    const startTime = Date.now();
    const response = await this.httpPost(url, body, {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    });
    const executionTime = Date.now() - startTime;

    Logger.info(`[QueryService] REST response: HTTP ${response.statusCode} in ${executionTime}ms`);

    if (response.statusCode !== 200) {
      Logger.error('[QueryService] REST error body', response.body.substring(0, 500));
      let errorMsg = `Query failed (HTTP ${response.statusCode})`;
      try {
        const parsed = JSON.parse(response.body);
        if (parsed.error?.message) {
          errorMsg = parsed.error.message;
        } else if (parsed.message) {
          errorMsg = parsed.message;
        }
      } catch { /* use default */ }
      throw new Error(errorMsg);
    }

    const data = JSON.parse(response.body);
    Logger.info(`[QueryService] REST returned ${data.tables?.length ?? 0} table(s)`);

    if (!data.tables || data.tables.length === 0) {
      return { columns: [], rows: [], statistics: { executionTime, rowCount: 0 } };
    }

    const table = data.tables[0];
    const columns: QueryColumn[] = table.columns.map((c: any) => ({
      name: c.name,
      type: c.type ?? 'string'
    }));

    const rows: Record<string, unknown>[] = table.rows.map((row: any[]) => {
      const record: Record<string, unknown> = {};
      table.columns.forEach((col: any, idx: number) => {
        record[col.name] = row[idx];
      });
      return record;
    });

    Logger.info(`[QueryService] Parsed ${rows.length} rows, ${columns.length} columns`);
    return { columns, rows, statistics: { executionTime, rowCount: rows.length } };
  }

  private httpPost(url: string, body: string, headers: Record<string, string>): Promise<{ statusCode: number; body: string }> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const req = https.request({
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: { ...headers, 'Content-Length': Buffer.byteLength(body).toString() },
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve({ statusCode: res.statusCode ?? 500, body: data }));
      });
      req.on('error', (e) => {
        Logger.error('[QueryService] HTTP error', e.message);
        reject(new Error(`HTTP request failed: ${e.message}`));
      });
      req.write(body);
      req.end();
    });
  }

  private mapTable(table: LogsTable, executionTime: number): QueryResult {
    const columns: QueryColumn[] = table.columnDescriptors.map(c => ({
      name: c.name,
      type: c.type?.toString() ?? 'string'
    }));

    const rows: Record<string, unknown>[] = table.rows.map(row => {
      const record: Record<string, unknown> = {};
      table.columnDescriptors.forEach((col, idx) => {
        record[col.name] = row[idx];
      });
      return record;
    });

    return { columns, rows, statistics: { executionTime, rowCount: rows.length } };
  }

  private toDuration(timeRange: TimeRangeValue): string {
    switch (timeRange.range) {
      case '30m': return 'PT30M';
      case '1h': return 'PT1H';
      case '6h': return 'PT6H';
      case '24h': return 'P1D';
      case '7d': return 'P7D';
      case 'custom': return 'P1D';
      default: return 'PT1H';
    }
  }
}
