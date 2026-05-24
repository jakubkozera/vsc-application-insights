import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useVSCodeMessaging, useColumnSettings } from '@shared/hooks';
import { Button, ColumnFilterControl, ColumnSettingsPanel, Dropdown, LoadingOverlay, RowDetailPanel, VirtualizedTable } from '@shared/components';
import { IconRefresh, IconSettings, IconList } from '@tabler/icons-react';
import { applyColumnFilters, ColumnFilter, formatFilterValue, getColumnFilterType } from '@shared/utils/columnFiltering';
import styles from './LogTable.module.css';

interface Column {
  name: string;
  type: string;
}

interface QueryResult {
  columns: Column[];
  rows: Record<string, unknown>[];
  statistics?: { executionTime: number; rowCount: number };
}

interface InitData {
  connectionId: string;
  tableName: string;
  connectionName: string;
}

const TIME_RANGES = [
  { label: 'Last 30 min', value: '30m' },
  { label: 'Last 1 hour', value: '1h' },
  { label: 'Last 6 hours', value: '6h' },
  { label: 'Last 24 hours', value: '24h' },
  { label: 'Last 7 days', value: '7d' },
];

const DEFAULT_TIME_RANGE = '6h';

const GROUP_BY_OPTIONS = [
  { label: 'No grouping', value: '' },
  { label: 'operation_Name', value: 'operation_Name' },
  { label: 'cloud_RoleName', value: 'cloud_RoleName' },
  { label: 'problemId', value: 'problemId' },
];

const EXCEPTION_TABLES = ['exceptions', 'exception'];

interface GroupedRows {
  key: string;
  rows: Record<string, unknown>[];
}

type DisplayRow =
  | { kind: 'group'; key: string; label: string; count: number }
  | { kind: 'data'; key: string; row: Record<string, unknown> };

export const App: React.FC = () => {
  const { postMessage, subscribe } = useVSCodeMessaging<any, any>();
  const [initData, setInitData] = useState<InitData | null>(null);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState(DEFAULT_TIME_RANGE);
  const [selectedRow, setSelectedRow] = useState<Record<string, unknown> | null>(null);
  const [filter, setFilter] = useState('');
  const [columnFilters, setColumnFilters] = useState<Record<string, ColumnFilter>>({});
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

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
        setInitData(msg.data as InitData);
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
    if (!initData) return;
    setLoading(true);
    setError(null);
    postMessage({ command: 'query', timeRange: { range: timeRange } });
  }, [postMessage, initData, timeRange]);

  useEffect(() => {
    if (initData) runQuery();
  }, [initData]);

  const handleTimeRangeChange = (value: string) => {
    setTimeRange(value);
    setLoading(true);
    postMessage({ command: 'query', timeRange: { range: value } });
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
    return rows;
  }, [result, filter, columnFilters]);

  const columnFilteredRows = useMemo(() => applyColumnFilters(filteredRows, result?.columns ?? [], columnFilters), [filteredRows, result?.columns, columnFilters]);

  const isExceptionTable = EXCEPTION_TABLES.includes(initData?.tableName?.toLowerCase() ?? '');

  const groupedRows = useMemo((): GroupedRows[] | null => {
    if (!groupBy || !isExceptionTable) return null;
    const groups = new Map<string, Record<string, unknown>[]>();
    for (const row of columnFilteredRows) {
      const key = String(row[groupBy] ?? '(empty)');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }
    return Array.from(groups.entries())
      .map(([key, rows]) => ({ key, rows }))
      .sort((a, b) => b.rows.length - a.rows.length);
  }, [columnFilteredRows, groupBy, isExceptionTable]);

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const displayRows = useMemo<DisplayRow[]>(() => {
    if (!groupedRows) {
      return columnFilteredRows.map((row, idx) => ({ kind: 'data', key: `row:${idx}`, row }));
    }

    return groupedRows.flatMap(group => {
      const items: DisplayRow[] = [{ kind: 'group', key: `group:${group.key}`, label: group.key, count: group.rows.length }];
      if (!collapsedGroups.has(group.key)) {
        items.push(...group.rows.map((row, idx) => ({ kind: 'data', key: `row:${group.key}:${idx}`, row })));
      }
      return items;
    });
  }, [collapsedGroups, columnFilteredRows, groupedRows]);

  const tableColumns = useMemo(() => visibleColumns.map((col, columnIndex) => {
    const type = getColumnFilterType(col.type);
    const availableValues = type === 'text'
      ? Array.from(new Set(applyColumnFilters(filteredRows, result?.columns ?? [], columnFilters, col.name).map(row => formatFilterValue(row[col.name])))).sort((left, right) => left.localeCompare(right))
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
      renderCell: (item: DisplayRow) => {
        if (item.kind === 'group') {
          return columnIndex === 0 ? (
            <span className={styles.groupHeaderCell}>
              <IconList size={12} />
              <span className={styles.groupKey}>{item.label}</span>
              <span className={styles.groupCount}>({item.count})</span>
            </span>
          ) : null;
        }

        return formatValue(item.row[col.name]);
      },
    };
  }), [activeFilter, columnFilters, visibleColumns]);

  return (
    <div className={styles.container}>
      <LoadingOverlay visible={loading} message="Running query..." />

      <div className={styles.toolbar}>
        <h2 className={styles.title}>{initData?.tableName ?? 'Loading...'}</h2>
        <div className={styles.toolbarRight}>
          <input
            className={styles.filterInput}
            placeholder="Filter results..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {isExceptionTable && (
            <Dropdown options={GROUP_BY_OPTIONS} value={groupBy} onChange={setGroupBy} />
          )}
          <Dropdown options={TIME_RANGES} value={timeRange} onChange={handleTimeRangeChange} />
          <Button variant="icon" onClick={runQuery} title="Refresh">
            <IconRefresh size={16} />
          </Button>
          <Button variant="icon" onClick={() => setShowSettings(true)} title="Column settings">
            <IconSettings size={16} />
          </Button>
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {result && (
        <>
          <div className={styles.stats}>
            {result.statistics?.rowCount} rows • {result.statistics?.executionTime}ms
          </div>

          <VirtualizedTable
            rows={displayRows}
            columns={tableColumns}
            wrapperClassName={styles.tableWrapper}
            rowKey={(item) => item.key}
            rowClassName={(item) => item.kind === 'group' ? styles.groupHeader : `${styles.tr} ${selectedRow === item.row ? styles.selected : ''}`}
            onRowClick={(item) => {
              if (item.kind === 'group') {
                toggleGroup(item.label);
                return;
              }
              setSelectedRow(selectedRow === item.row ? null : item.row);
            }}
            emptyState={<div className={styles.stats}>No matching rows</div>}
            ariaLabel="Log table results"
            onColumnResize={(columnId, width) => handleColumnsChange(columnConfig.map(column => column.name === columnId ? { ...column, width } : column))}
          />

          {selectedRow && (
            <RowDetailPanel row={selectedRow} onClose={() => setSelectedRow(null)} />
          )}
        </>
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

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
