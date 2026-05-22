import React, { useEffect, useState, useMemo } from 'react';
import { useVSCodeMessaging, useColumnSettings } from '@shared/hooks';
import { Button, ColumnSettingsPanel, RowDetailPanel, VirtualizedTable } from '@shared/components';
import { IconFilter, IconX, IconSettings } from '@tabler/icons-react';
import styles from './QueryResults.module.css';

interface Column {
  name: string;
  type: string;
}

interface QueryResult {
  columns: Column[];
  rows: Record<string, unknown>[];
  statistics?: { executionTime: number; rowCount: number };
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

export const App: React.FC = () => {
  const { postMessage, subscribe } = useVSCodeMessaging<any, any>();
  const [result, setResult] = useState<QueryResult | null>(null);
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
        setResult(msg.data?.result as QueryResult);
      }
    });
    postMessage({ command: 'webviewReady' });
    return unsub;
  }, [postMessage, subscribe]);

  if (!result) {
    return <div className={styles.container}><p className={styles.empty}>No results</p></div>;
  }

  const filteredRows = (() => {
    let rows = result.rows;
    if (filter) {
      rows = rows.filter(row =>
        Object.values(row).some(v =>
          String(v ?? '').toLowerCase().includes(filter.toLowerCase())
        )
      );
    }
    for (const [colName, cf] of Object.entries(columnFilters)) {
      if (!cf.value) continue;
      const col = result.columns.find(c => c.name === colName);
      const type = col ? getColumnFilterType(col.type) : 'text';
      rows = rows.filter(row => matchesFilter(row[colName], cf, type));
    }
    return rows;
  })();

  const tableColumns = visibleColumns.map(col => {
    const type = getColumnFilterType(col.type);
    const ops = getOpsForType(type);
    const defaultOp = getDefaultOp(type);
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
  });

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <span className={styles.stats}>
          {result.statistics?.rowCount} rows • {result.statistics?.executionTime}ms
        </span>
        <div className={styles.toolbarRight}>
          <input
            className={styles.filterInput}
            placeholder="Filter..."
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
        emptyState={<div className={styles.empty}>No matching rows</div>}
        ariaLabel="Saved query results"
        onColumnResize={(columnId, width) => handleColumnsChange(columnConfig.map(column => column.name === columnId ? { ...column, width } : column))}
      />

      {selectedRow && (
        <RowDetailPanel row={selectedRow} onClose={() => setSelectedRow(null)} />
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
