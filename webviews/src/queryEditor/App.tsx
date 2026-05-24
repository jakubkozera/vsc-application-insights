import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useVSCodeMessaging, useColumnSettings } from '@shared/hooks';
import { Button, ColumnFilterControl, ColumnSettingsPanel, Dropdown, LoadingOverlay, RowDetailPanel, VirtualizedTable } from '@shared/components';
import { IconPlayerPlay, IconBookmark, IconSettings } from '@tabler/icons-react';
import { applyColumnFilters, ColumnFilter, formatFilterValue, getColumnFilterType } from '@shared/utils/columnFiltering';
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
  initialMode?: QueryMode;
}

type QueryMode = 'search' | 'kql';

const TIME_RANGES = [
  { label: 'Last 30 min', value: '30m' },
  { label: 'Last 1 hour', value: '1h' },
  { label: 'Last 6 hours', value: '6h' },
  { label: 'Last 24 hours', value: '24h' },
  { label: 'Last 7 days', value: '7d' },
];

const DEFAULT_TIME_RANGE = '6h';

const SEARCH_TABLES = [
  'availabilityResults',
  'requests',
  'exceptions',
  'pageViews',
  'traces',
  'customEvents',
  'dependencies',
] as const;

const KQL_KEYWORDS = new Set([
  'and', 'as', 'asc', 'by', 'contains', 'desc', 'distinct', 'extend', 'false', 'from', 'has', 'in', 'isfuzzy',
  'join', 'let', 'limit', 'not', 'null', 'on', 'or', 'order', 'project', 'render', 'serialize', 'summarize',
  'take', 'top', 'true', 'union', 'where'
]);

const KQL_FUNCTIONS = new Set([
  'ago', 'avg', 'bin', 'case', 'coalesce', 'count', 'datetime', 'format_datetime', 'iff', 'isnotempty', 'isempty',
  'make_set', 'max', 'min', 'parse_json', 'percentile', 'replace_string', 'split', 'startofday', 'strcat', 'sum', 'todynamic', 'tostring'
]);

const KQL_TABLES = new Set([...SEARCH_TABLES, 'customEvents']);

const SAMPLE_QUERIES: Record<string, string> = {
  requests: 'requests\n| where timestamp > ago(6h)\n| order by timestamp desc\n| project timestamp, name, resultCode, duration, url',
  exceptions: 'exceptions\n| where timestamp > ago(6h)\n| order by timestamp desc\n| project timestamp, type, outerMessage, innermostMessage',
  traces: 'traces\n| where timestamp > ago(6h)\n| order by timestamp desc\n| project timestamp, message, severityLevel',
  dependencies: 'dependencies\n| where timestamp > ago(6h)\n| order by timestamp desc\n| project timestamp, name, type, target, duration, success',
};

export const App: React.FC = () => {
  const { postMessage, subscribe } = useVSCodeMessaging<any, any>();
  const [initData, setInitData] = useState<InitData | null>(null);
  const [queryMode, setQueryMode] = useState<QueryMode>('search');
  const [searchText, setSearchText] = useState('');
  const [kql, setKql] = useState('');
  const [editorScrollTop, setEditorScrollTop] = useState(0);
  const [editorScrollLeft, setEditorScrollLeft] = useState(0);
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
    handleColumnsChange, handleSavePreset, handleLoadPreset, handleDeletePreset, handleAutoSizeColumns
  } = useColumnSettings({ allColumns: result?.columns ?? [], allRows: result?.rows ?? [], postMessage, subscribe });

  useEffect(() => {
    if (!activeFilter) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-column-filter-popup="true"]') && !target.closest('[data-column-filter-button="true"]')) {
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
        if (data.initialMode) {
          setQueryMode(data.initialMode);
        }
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

  const lineNumbers = useMemo(() => {
    const lineCount = Math.max(1, kql.split('\n').length);
    return Array.from({ length: lineCount }, (_, index) => index + 1);
  }, [kql]);

  const highlightedKql = useMemo(() => renderHighlightedKql(kql), [kql]);

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

  const textFilteredRows = useMemo(() => {
    let rows = result?.rows ?? [];
    if (filter) {
      rows = rows.filter(row =>
        Object.values(row).some(v =>
          String(v ?? '').toLowerCase().includes(filter.toLowerCase())
        )
      );
    }
    return rows;
  }, [result, filter, columnFilters]);

  const filteredRows = useMemo(() => applyColumnFilters(textFilteredRows, result?.columns ?? [], columnFilters), [textFilteredRows, result?.columns, columnFilters]);

  const tableColumns = useMemo(() => visibleColumns.map(col => {
    const type = getColumnFilterType(col.type);
    const availableValues = type === 'text'
      ? Array.from(new Set(applyColumnFilters(textFilteredRows, result?.columns ?? [], columnFilters, col.name).map(row => formatFilterValue(row[col.name])))).sort((left, right) => left.localeCompare(right))
      : [];
    return {
      id: col.name,
      headerClassName: styles.th,
      cellClassName: styles.td,
      minWidth: col.width ?? 96,
      width: col.width,
      header: (
        <>
          <span className={styles.thContent}>
            {col.name}
            <ColumnFilterControl
              columnName={col.name}
              type={type}
              filter={columnFilters[col.name]}
              active={activeFilter === col.name}
              uniqueValues={availableValues}
              onToggle={() => setActiveFilter(activeFilter === col.name ? null : col.name)}
              onChange={(nextFilter) => setColumnFilters((prev) => ({ ...prev, [col.name]: nextFilter }))}
              onClear={() => {
                setColumnFilters((prev) => {
                  const next = { ...prev };
                  delete next[col.name];
                  return next;
                });
                setActiveFilter(null);
              }}
            />
          </span>
        </>
      ),
      renderCell: (row: Record<string, unknown>) => formatValue(row[col.name]),
    };
  }), [activeFilter, columnFilters, visibleColumns, textFilteredRows, result?.columns]);

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
            <div className={styles.kqlEditorShell}>
              <div className={styles.kqlEditorSurface}>
                <pre
                  className={styles.editorHighlight}
                  aria-hidden="true"
                  data-testid="kql-editor-highlight"
                  style={{ transform: `translate(${-editorScrollLeft}px, ${-editorScrollTop}px)` }}
                >
                  {highlightedKql}
                </pre>
                <textarea
                  className={`${styles.editorInput} ${kql ? styles.editorInputOverlay : ''}`}
                  value={kql}
                  onChange={(e) => setKql(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onScroll={(e) => {
                    setEditorScrollTop(e.currentTarget.scrollTop);
                    setEditorScrollLeft(e.currentTarget.scrollLeft);
                  }}
                  placeholder="Enter your KQL query here...&#10;&#10;Press Ctrl+Shift+Enter to run"
                  spellCheck={false}
                />
              </div>
              <div className={styles.lineNumbers} aria-hidden="true" data-testid="kql-line-numbers">
                <div className={styles.lineNumbersInner} style={{ transform: `translateY(${-editorScrollTop}px)` }}>
                  {lineNumbers.map((lineNumber) => (
                    <span key={lineNumber} className={styles.lineNumber}>{lineNumber}</span>
                  ))}
                </div>
              </div>
            </div>
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
            onColumnResize={(columnId, width) => handleColumnsChange(columnConfig.map(column => column.name === columnId ? { ...column, width } : column))}
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
          onAutoSizeColumns={handleAutoSizeColumns}
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
    default: return 6 * 60 * 60 * 1000;
  }
}

function escapeKqlString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function renderHighlightedKql(value: string): React.ReactNode {
  if (!value) return <span className={styles.editorPlaceholder}>Enter your KQL query here...</span>;

  const lines = value.split('\n');
  return lines.map((line, lineIndex) => (
    <React.Fragment key={`line-${lineIndex}`}>
      {tokenizeKqlLine(line, lineIndex)}
      {lineIndex < lines.length - 1 ? '\n' : null}
    </React.Fragment>
  ));
}

function tokenizeKqlLine(line: string, lineIndex: number): React.ReactNode[] {
  const pattern = /(\/\/.*$|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\|\s*|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_\-]*\b|\s+|.)/g;
  const tokens = line.match(pattern) ?? [];

  return tokens.map((token, tokenIndex) => {
    const className = classifyKqlToken(token);
    if (!className) {
      return <React.Fragment key={`${lineIndex}-${tokenIndex}`}>{token}</React.Fragment>;
    }

    return <span key={`${lineIndex}-${tokenIndex}`} className={className}>{token}</span>;
  });
}

function classifyKqlToken(token: string): string | null {
  const normalized = token.trim().toLowerCase();
  if (!normalized) return null;
  if (token.startsWith('//')) return styles.tokenComment;
  if (token.startsWith('"') || token.startsWith('\'')) return styles.tokenString;
  if (/^\|\s*$/.test(token)) return styles.tokenPipe;
  if (/^\d/.test(token)) return styles.tokenNumber;
  if (KQL_KEYWORDS.has(normalized)) return styles.tokenKeyword;
  if (KQL_FUNCTIONS.has(normalized)) return styles.tokenFunction;
  if (KQL_TABLES.has(normalized)) return styles.tokenTable;
  return null;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
