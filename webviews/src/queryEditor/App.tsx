import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useVSCodeMessaging, useColumnSettings } from '@shared/hooks';
import { Button, ColumnSettingsPanel, Dropdown, LoadingOverlay, RowDetailPanel, VirtualizedTable } from '@shared/components';
import { IconPlayerPlay, IconBookmark, IconFilter, IconX, IconSettings } from '@tabler/icons-react';
import styles from './QueryEditor.module.css';

interface Column {
  name: string;
  type: string;
}

interface QueryResult {
  columns: Column[];
  rows: Record<string, unknown>[];
  statistics?: { executionTime: number; rowCount: number };
}

interface ConnectionOption {
  id: string;
  name: string;
}

interface InitData {
  connectionId: string;
  connectionName: string;
  connections: ConnectionOption[];
  initialQuery?: string;
}

type QueryMode = 'search' | 'kql';

type FilterOp = 'contains' | 'equals' | 'startsWith' | 'endsWith' | 'gt' | 'gte' | 'lt' | 'lte' | 'before' | 'after';

interface ColumnFilter {
  op: FilterOp;
  value: string;
}

const TEXT_OPS: { value: FilterOp; label: string }[] = [
  { value: 'contains', label: 'Contains' },
  { value: 'equals', label: 'Equals' },
  { value: 'startsWith', label: 'Starts with' },
  { value: 'endsWith', label: 'Ends with' },
];

const NUMBER_OPS: { value: FilterOp; label: string }[] = [
  { value: 'equals', label: '=' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '≥' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '≤' },
];

const DATE_OPS: { value: FilterOp; label: string }[] = [
  { value: 'contains', label: 'Contains' },
  { value: 'after', label: 'After' },
  { value: 'before', label: 'Before' },
  { value: 'equals', label: 'Equals' },
];

function getColumnFilterType(colType: string): 'text' | 'number' | 'date' {
  const t = colType.toLowerCase();
  if (t === 'int' || t === 'long' || t === 'real' || t === 'double' || t === 'decimal') return 'number';
  if (t === 'datetime' || t === 'timespan') return 'date';
  return 'text';
}

function getOpsForType(type: 'text' | 'number' | 'date') {
  if (type === 'number') return NUMBER_OPS;
  if (type === 'date') return DATE_OPS;
  return TEXT_OPS;
}

function getDefaultOp(type: 'text' | 'number' | 'date'): FilterOp {
  if (type === 'number') return 'gte';
  if (type === 'date') return 'contains';
  return 'contains';
}

function matchesFilter(cellValue: unknown, filter: ColumnFilter, type: 'text' | 'number' | 'date'): boolean {
  const val = filter.value;
  if (!val) return true;

  if (type === 'number') {
    const num = Number(val);
    const cell = typeof cellValue === 'number' ? cellValue : Number(cellValue ?? 0);
    if (isNaN(num)) return true;
    switch (filter.op) {
      case 'equals': return cell === num;
      case 'gt': return cell > num;
      case 'gte': return cell >= num;
      case 'lt': return cell < num;
      case 'lte': return cell <= num;
      default: return true;
    }
  }

  if (type === 'date') {
    const cellStr = String(cellValue ?? '');
    switch (filter.op) {
      case 'contains': return cellStr.toLowerCase().includes(val.toLowerCase());
      case 'after': return cellStr >= val;
      case 'before': return cellStr <= val;
      case 'equals': return cellStr.startsWith(val);
      default: return true;
    }
  }

  const cellStr = String(cellValue ?? '').toLowerCase();
  const search = val.toLowerCase();
  switch (filter.op) {
    case 'contains': return cellStr.includes(search);
    case 'equals': return cellStr === search;
    case 'startsWith': return cellStr.startsWith(search);
    case 'endsWith': return cellStr.endsWith(search);
    default: return true;
  }
}

const TIME_RANGES = [
  { label: 'Last 30 min', value: '30m' },
  { label: 'Last 1 hour', value: '1h' },
  { label: 'Last 6 hours', value: '6h' },
  { label: 'Last 24 hours', value: '24h' },
  { label: 'Last 7 days', value: '7d' },
];

const DEFAULT_TIME_RANGE = '24h';

const SEARCH_TABLES = [
  'availabilityResults',
  'requests',
  'exceptions',
  'pageViews',
  'traces',
  'customEvents',
  'dependencies',
] as const;

const SAMPLE_QUERIES: Record<string, string> = {
  requests: 'requests\n| where timestamp > ago(24h)\n| order by timestamp desc\n| project timestamp, name, resultCode, duration, url',
  exceptions: 'exceptions\n| where timestamp > ago(24h)\n| order by timestamp desc\n| project timestamp, type, outerMessage, innermostMessage',
  traces: 'traces\n| where timestamp > ago(24h)\n| order by timestamp desc\n| project timestamp, message, severityLevel',
  dependencies: 'dependencies\n| where timestamp > ago(24h)\n| order by timestamp desc\n| project timestamp, name, type, target, duration, success',
};

export const App: React.FC = () => {
  const { postMessage, subscribe } = useVSCodeMessaging<any, any>();
  const [initData, setInitData] = useState<InitData | null>(null);
  const [queryMode, setQueryMode] = useState<QueryMode>('search');
  const [searchText, setSearchText] = useState('');
  const [kql, setKql] = useState('');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState(DEFAULT_TIME_RANGE);
  const [connectionId, setConnectionId] = useState('');
  const [selectedRow, setSelectedRow] = useState<Record<string, unknown> | null>(null);
  const [filter, setFilter] = useState('');
  const [columnFilters, setColumnFilters] = useState<Record<string, ColumnFilter>>({});
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const {
    columnConfig, visibleColumns, presets, showSettings, setShowSettings,
    handleColumnsChange, handleSavePreset, handleLoadPreset, handleDeletePreset
  } = useColumnSettings({ allColumns: result?.columns ?? [], postMessage, subscribe });

  useEffect(() => {
    if (!activeFilter) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(`.${styles.filterPopup}`) && !target.closest(`.${styles.filterBtn}`)) {
        setActiveFilter(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [activeFilter]);

  useEffect(() => {
    const unsub = subscribe((msg) => {
      if (msg.command === 'init') {
        const data = msg.data as InitData;
        setInitData(data);
        setConnectionId(data.connectionId);
        if (data.initialQuery) {
          setQueryMode('kql');
          setKql(data.initialQuery);
        }
      } else if (msg.command === 'queryResult') {
        setResult(msg.data as QueryResult);
        setLoading(false);
        setError(null);
      } else if (msg.command === 'queryError') {
        setError(msg.error);
        setLoading(false);
      }
    });
    postMessage({ command: 'webviewReady' });
    return unsub;
  }, [postMessage, subscribe]);

  const effectiveQuery = useMemo(() => {
    if (queryMode === 'kql') {
      return kql;
    }
    return buildSearchQuery(searchText, timeRange, new Date());
  }, [kql, queryMode, searchText, timeRange]);

  const runQuery = useCallback(() => {
    const query = queryMode === 'kql' ? kql.trim() : buildSearchQuery(searchText, timeRange).trim();
    if (!query) return;
    setLoading(true);
    setError(null);
    setSelectedRow(null);
    postMessage({ command: 'runQuery', kql: query, connectionId, timeRange: { range: timeRange } });
  }, [postMessage, queryMode, kql, searchText, connectionId, timeRange]);

  const saveQuery = () => {
    const query = queryMode === 'kql' ? kql.trim() : buildSearchQuery(searchText, timeRange).trim();
    if (!query) return;
    postMessage({ command: 'saveQuery', kql: query, connectionId });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Enter') {
      e.preventDefault();
      runQuery();
    }
  };

  const insertSample = (table: string) => {
    const sample = SAMPLE_QUERIES[table];
    if (sample) setKql(sample);
  };

  const filteredRows = useMemo(() => {
    let rows = result?.rows ?? [];
    if (filter) {
      rows = rows.filter(row =>
        Object.values(row).some(v =>
          String(v ?? '').toLowerCase().includes(filter.toLowerCase())
        )
      );
    }
    for (const [colName, cf] of Object.entries(columnFilters)) {
      if (!cf.value) continue;
      const col = result?.columns.find(c => c.name === colName);
      const type = col ? getColumnFilterType(col.type) : 'text';
      rows = rows.filter(row => matchesFilter(row[colName], cf, type));
    }
    return rows;
  }, [result, filter, columnFilters]);

  const tableColumns = useMemo(() => visibleColumns.map(col => {
    const type = getColumnFilterType(col.type);
    const ops = getOpsForType(type);
    const defaultOp = getDefaultOp(type);
    return {
      id: col.name,
      headerClassName: styles.th,
      cellClassName: styles.td,
      minWidth: 180,
      header: (
        <>
          <span className={styles.thContent}>
            {col.name}
            <button
              className={`${styles.filterBtn} ${columnFilters[col.name] ? styles.filterBtnActive : ''}`}
              onClick={(e) => { e.stopPropagation(); setActiveFilter(activeFilter === col.name ? null : col.name); }}
              title="Filter"
            >
              <IconFilter size={12} stroke={2} />
            </button>
          </span>
          {activeFilter === col.name && (
            <div className={styles.filterPopup} onClick={(e) => e.stopPropagation()}>
              <select
                className={styles.filterSelect}
                value={columnFilters[col.name]?.op ?? defaultOp}
                onChange={(e) => setColumnFilters(p => ({ ...p, [col.name]: { ...p[col.name] ?? { op: defaultOp, value: '' }, op: e.target.value as FilterOp } }))}
              >
                {ops.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <input
                className={styles.colFilterInput}
                type={type === 'number' ? 'number' : 'text'}
                placeholder="Value…"
                autoFocus
                value={columnFilters[col.name]?.value ?? ''}
                onChange={(e) => setColumnFilters(p => ({ ...p, [col.name]: { op: p[col.name]?.op ?? defaultOp, value: e.target.value } }))}
              />
              <button className={styles.filterClear} onClick={() => { setColumnFilters(p => { const n = { ...p }; delete n[col.name]; return n; }); setActiveFilter(null); }}>
                <IconX size={12} />
              </button>
            </div>
          )}
        </>
      ),
      renderCell: (row: Record<string, unknown>) => formatValue(row[col.name]),
    };
  }), [activeFilter, columnFilters, visibleColumns]);

  return (
    <div className={styles.container}>
      <LoadingOverlay visible={loading} message="Running query..." />

      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          {initData && initData.connections.length > 1 && (
            <Dropdown
              options={initData.connections.map(c => ({ label: c.name, value: c.id }))}
              value={connectionId}
              onChange={setConnectionId}
              label="Connection:"
            />
          )}
          <Dropdown options={TIME_RANGES} value={timeRange} onChange={setTimeRange} label="Time:" />
        </div>
        <div className={styles.toolbarRight}>
          <Button variant="primary" onClick={runQuery} disabled={!effectiveQuery.trim()}>
            <IconPlayerPlay size={14} /> Run
          </Button>
          <Button variant="secondary" onClick={saveQuery} disabled={!effectiveQuery.trim()}>
            <IconBookmark size={14} /> Save
          </Button>
        </div>
      </div>

      <div className={styles.editorSection}>
        <div className={styles.modeTabs} role="tablist" aria-label="Query mode">
          <button
            className={`${styles.modeTab} ${queryMode === 'search' ? styles.modeTabActive : ''}`}
            onClick={() => setQueryMode('search')}
            role="tab"
            aria-selected={queryMode === 'search'}
          >
            Search
          </button>
          <button
            className={`${styles.modeTab} ${queryMode === 'kql' ? styles.modeTabActive : ''}`}
            onClick={() => setQueryMode('kql')}
            role="tab"
            aria-selected={queryMode === 'kql'}
          >
            KQL mode
          </button>
        </div>

        {queryMode === 'search' ? (
          <div className={styles.searchSection}>
            <input
              className={styles.searchInput}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search across traces, requests, dependencies, exceptions..."
              aria-label="Search text"
            />
            <div className={styles.searchHint}>Search builds a cross-table KQL query across core telemetry tables.</div>
            <pre className={styles.queryPreview}>{effectiveQuery || 'Enter text to generate the KQL preview.'}</pre>
          </div>
        ) : (
          <>
            <div className={styles.sampleButtons}>
              {Object.keys(SAMPLE_QUERIES).map(table => (
                <button key={table} className={styles.sampleBtn} onClick={() => insertSample(table)}>
                  {table}
                </button>
              ))}
            </div>
            <textarea
              className={styles.editor}
              value={kql}
              onChange={(e) => setKql(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter your KQL query here...&#10;&#10;Press Ctrl+Shift+Enter to run"
              spellCheck={false}
            />
          </>
        )}
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {result && (
        <div className={styles.resultsSection}>
          <div className={styles.resultsHeader}>
            <span className={styles.stats}>
              {result.statistics?.rowCount} rows • {result.statistics?.executionTime}ms
            </span>
            <div className={styles.resultsHeaderRight}>
              <input
                className={styles.filterInput}
                placeholder="Filter results..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              <Button variant="icon" onClick={() => setShowSettings(true)} title="Column settings">
                <IconSettings size={14} />
              </Button>
            </div>
          </div>
          <VirtualizedTable
            rows={filteredRows}
            columns={tableColumns}
            wrapperClassName={styles.tableWrapper}
            rowKey={(_, idx) => idx}
            rowClassName={(row) => `${styles.tr} ${selectedRow === row ? styles.selected : ''}`}
            onRowClick={(row) => setSelectedRow(selectedRow === row ? null : row)}
            emptyState={<div className={styles.stats}>No matching rows</div>}
            ariaLabel="Query results"
          />

          {selectedRow && (
            <RowDetailPanel row={selectedRow} onClose={() => setSelectedRow(null)} />
          )}
        </div>
      )}

      {showSettings && (
        <ColumnSettingsPanel
          columns={columnConfig}
          presets={presets}
          onColumnsChange={handleColumnsChange}
          onSavePreset={handleSavePreset}
          onLoadPreset={handleLoadPreset}
          onDeletePreset={handleDeletePreset}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
};

function buildSearchQuery(searchText: string, timeRange: string, now = new Date()): string {
  const trimmed = searchText.trim();
  if (!trimmed) return '';

  const end = now.toISOString();
  const start = new Date(now.getTime() - getTimeRangeMilliseconds(timeRange)).toISOString();
  const escapedSearchText = escapeKqlString(trimmed);

  return [
    'union isfuzzy=true',
    ...SEARCH_TABLES.map((table, index) => `    ${table}${index < SEARCH_TABLES.length - 1 ? ',' : ''}`),
    `| where timestamp > datetime("${start}") and timestamp < datetime("${end}")`,
    `| where * has "${escapedSearchText}"`,
    '| order by timestamp desc',
    '| take 100',
  ].join('\n');
}

function getTimeRangeMilliseconds(timeRange: string): number {
  switch (timeRange) {
    case '30m': return 30 * 60 * 1000;
    case '1h': return 60 * 60 * 1000;
    case '6h': return 6 * 60 * 60 * 1000;
    case '24h': return 24 * 60 * 60 * 1000;
    case '7d': return 7 * 24 * 60 * 60 * 1000;
    default: return 24 * 60 * 60 * 1000;
  }
}

function escapeKqlString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
