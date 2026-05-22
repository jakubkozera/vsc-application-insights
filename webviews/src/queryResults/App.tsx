import React, { useEffect, useState, useMemo } from 'react';
import { useVSCodeMessaging, useColumnSettings } from '@shared/hooks';
import { Button, ColumnFilterControl, ColumnSettingsPanel, RowDetailPanel, VirtualizedTable } from '@shared/components';
import { IconSettings } from '@tabler/icons-react';
import { applyColumnFilters, ColumnFilter, formatFilterValue, getColumnFilterType } from '@shared/utils/columnFiltering';
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
        setResult(msg.data?.result as QueryResult);
      }
    });
    postMessage({ command: 'webviewReady' });
    return unsub;
  }, [postMessage, subscribe]);

  if (!result) {
    return <div className={styles.container}><p className={styles.empty}>No results</p></div>;
  }

  const textFilteredRows = (() => {
    let rows = result.rows;
    if (filter) {
      rows = rows.filter(row =>
        Object.values(row).some(v =>
          String(v ?? '').toLowerCase().includes(filter.toLowerCase())
        )
      );
    }
    return rows;
  })();

  const filteredRows = applyColumnFilters(textFilteredRows, result.columns, columnFilters);

  const tableColumns = visibleColumns.map(col => {
    const type = getColumnFilterType(col.type);
    const availableValues = type === 'text'
      ? Array.from(new Set(applyColumnFilters(textFilteredRows, result.columns, columnFilters, col.name).map(row => formatFilterValue(row[col.name])))).sort((left, right) => left.localeCompare(right))
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
