import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useVSCodeMessaging, useColumnSettings } from '@shared/hooks';
import { Button, ColumnSettingsPanel, Dropdown, LoadingOverlay, RowDetailPanel } from '@shared/components';
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

const SAMPLE_QUERIES: Record<string, string> = {
  requests: 'requests\n| where timestamp > ago(1h)\n| top 50 by timestamp desc\n| project timestamp, name, resultCode, duration, url',
  exceptions: 'exceptions\n| where timestamp > ago(1h)\n| top 50 by timestamp desc\n| project timestamp, type, outerMessage, innermostMessage',
  traces: 'traces\n| where timestamp > ago(1h)\n| top 50 by timestamp desc\n| project timestamp, message, severityLevel',
  dependencies: 'dependencies\n| where timestamp > ago(1h)\n| top 50 by timestamp desc\n| project timestamp, name, type, target, duration, success',
};

export const App: React.FC = () => {
  const { postMessage, subscribe } = useVSCodeMessaging<any, any>();
  const [initData, setInitData] = useState<InitData | null>(null);
  const [kql, setKql] = useState('');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState('1h');
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

  const runQuery = useCallback(() => {
    if (!kql.trim()) return;
    setLoading(true);
    setError(null);
    setSelectedRow(null);
    postMessage({ command: 'runQuery', kql, connectionId, timeRange: { range: timeRange } });
  }, [postMessage, kql, connectionId, timeRange]);

  const saveQuery = () => {
    if (!kql.trim()) return;
    postMessage({ command: 'saveQuery', kql, connectionId });
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
          <Button variant="primary" onClick={runQuery} disabled={!kql.trim()}>
            <IconPlayerPlay size={14} /> Run
          </Button>
          <Button variant="secondary" onClick={saveQuery} disabled={!kql.trim()}>
            <IconBookmark size={14} /> Save
          </Button>
        </div>
      </div>

      <div className={styles.editorSection}>
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

          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  {visibleColumns.map(col => {
                    const type = getColumnFilterType(col.type);
                    const ops = getOpsForType(type);
                    const defaultOp = getDefaultOp(type);
                    return (
                      <th key={col.name} className={styles.th}>
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
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, idx) => (
                  <tr
                    key={idx}
                    className={`${styles.tr} ${selectedRow === row ? styles.selected : ''}`}
                    onClick={() => setSelectedRow(selectedRow === row ? null : row)}
                  >
                    {visibleColumns.map(col => (
                      <td key={col.name} className={styles.td}>
                        {formatValue(row[col.name])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
