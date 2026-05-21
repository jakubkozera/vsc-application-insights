export type AuthMode = 'aad' | 'apikey';

export interface ConnectionMetadata {
  id: string;
  displayName: string;
  /** Application Insights Application ID or Log Analytics Workspace ID */
  resourceId: string;
  /** The type of resource */
  resourceType: 'appInsights' | 'logAnalytics';
  authMode: AuthMode;
  tenantId?: string;
  createdAt: string;
  lastUsedAt?: string;
}

export type LogTable = 'requests' | 'exceptions' | 'traces' | 'dependencies' | 'customEvents';

export interface SavedQuery {
  id: string;
  name: string;
  kql: string;
  connectionId?: string;
  createdAt: string;
}

export interface QueryResult {
  columns: QueryColumn[];
  rows: Record<string, unknown>[];
  statistics?: QueryStatistics;
}

export interface QueryColumn {
  name: string;
  type: string;
}

export interface QueryStatistics {
  executionTime: number;
  rowCount: number;
}

export type TimeRange = '30m' | '1h' | '6h' | '24h' | '7d' | 'custom';

export interface TimeRangeValue {
  range: TimeRange;
  from?: string;
  to?: string;
}
