import { useCallback, useEffect, useState } from 'react';
import { ColumnConfig, ColumnPreset } from '@shared/components';

interface Column {
  name: string;
  type: string;
}

interface UseColumnSettingsOptions {
  /** All columns from the query result */
  allColumns: Column[];
  /** Sample rows used for default autosizing */
  allRows?: Record<string, unknown>[];
  /** postMessage to extension backend */
  postMessage: (msg: any) => void;
  /** subscribe to messages from backend */
  subscribe: (handler: (msg: any) => void) => () => void;
}

interface UseColumnSettingsReturn {
  /** Column config (order + visibility) */
  columnConfig: ColumnConfig[];
  /** Visible columns in order */
  visibleColumns: Array<Column & { width?: number }>;
  /** Available presets */
  presets: ColumnPreset[];
  /** Whether settings panel is open */
  showSettings: boolean;
  /** Toggle settings panel */
  setShowSettings: (show: boolean) => void;
  /** Update column config (from panel) */
  handleColumnsChange: (config: ColumnConfig[]) => void;
  /** Save a preset */
  handleSavePreset: (name: string, columns: string[]) => void;
  /** Load a preset */
  handleLoadPreset: (preset: ColumnPreset) => void;
  /** Delete a preset */
  handleDeletePreset: (id: string) => void;
  /** Recalculate column widths from current rows */
  handleAutoSizeColumns: () => void;
}

export function useColumnSettings({ allColumns, allRows = [], postMessage, subscribe }: UseColumnSettingsOptions): UseColumnSettingsReturn {
  const [columnConfig, setColumnConfig] = useState<ColumnConfig[]>([]);
  const [presets, setPresets] = useState<ColumnPreset[]>([]);
  const [showSettings, setShowSettings] = useState(false);

  // Initialize column config when allColumns change
  useEffect(() => {
    if (allColumns.length === 0) return;
    const autoWidths = calculateColumnWidths(allColumns, allRows);
    setColumnConfig(prev => {
      // Preserve existing visibility/order if columns haven't changed
      if (prev.length > 0) {
        const existingNames = new Set(prev.map(c => c.name));
        const newCols = allColumns.filter(c => !existingNames.has(c.name));
        if (newCols.length === 0 && prev.length === allColumns.length && prev.every(c => typeof c.width === 'number')) return prev;
        // Merge: keep existing order, add new ones at end
        const merged = prev
          .filter(c => allColumns.some(ac => ac.name === c.name))
          .map(c => ({ ...c, width: c.width ?? autoWidths.get(c.name) }));
        newCols.forEach(c => merged.push({ name: c.name, visible: true, width: autoWidths.get(c.name) }));
        return merged;
      }
      return allColumns.map(c => ({ name: c.name, visible: true, width: autoWidths.get(c.name) }));
    });
  }, [allColumns, allRows]);

  // Request presets on mount
  useEffect(() => {
    postMessage({ command: 'getColumnPresets' });
  }, [postMessage]);

  // Listen for preset responses
  useEffect(() => {
    const unsub = subscribe((msg: any) => {
      if (msg.command === 'columnPresets') {
        setPresets(msg.presets ?? []);
      }
    });
    return unsub;
  }, [subscribe]);

  const handleColumnsChange = useCallback((config: ColumnConfig[]) => {
    setColumnConfig(config);
  }, []);

  const handleSavePreset = useCallback((name: string, columns: string[]) => {
    postMessage({ command: 'saveColumnPreset', name, columns });
    // Optimistically add/update
    setPresets(prev => {
      const existing = prev.find(p => p.name === name);
      if (existing) {
        return prev.map(p => p.name === name ? { ...p, columns } : p);
      }
      return [...prev, { id: `temp-${Date.now()}`, name, columns, createdAt: new Date().toISOString() }];
    });
  }, [postMessage]);

  const handleLoadPreset = useCallback((preset: ColumnPreset) => {
    // Reorder columns to match preset order, only show preset columns
    const presetSet = new Set(preset.columns);
    const ordered: ColumnConfig[] = [];
    const currentWidths = new Map(columnConfig.map(c => [c.name, c.width]));
    // First: columns in preset order (visible)
    for (const name of preset.columns) {
      if (allColumns.some(c => c.name === name)) {
        ordered.push({ name, visible: true, width: currentWidths.get(name) });
      }
    }
    // Then: remaining columns (hidden)
    for (const col of allColumns) {
      if (!presetSet.has(col.name)) {
        ordered.push({ name: col.name, visible: false, width: currentWidths.get(col.name) });
      }
    }
    setColumnConfig(ordered);
    setShowSettings(false);
  }, [allColumns, columnConfig]);

  const handleDeletePreset = useCallback((id: string) => {
    postMessage({ command: 'deleteColumnPreset', id });
    setPresets(prev => prev.filter(p => p.id !== id));
  }, [postMessage]);

  const handleAutoSizeColumns = useCallback(() => {
    const autoWidths = calculateColumnWidths(allColumns, allRows);
    setColumnConfig(prev => prev.map(column => ({ ...column, width: autoWidths.get(column.name) ?? column.width })));
  }, [allColumns, allRows]);

  const visibleColumns = columnConfig
    .filter(c => c.visible)
    .map(c => {
      const column = allColumns.find(ac => ac.name === c.name);
      return column ? { ...column, width: c.width } : undefined;
    })
    .filter(Boolean);

  return {
    columnConfig,
    visibleColumns,
    presets,
    showSettings,
    setShowSettings,
    handleColumnsChange,
    handleSavePreset,
    handleLoadPreset,
    handleDeletePreset,
    handleAutoSizeColumns,
  };
}

function calculateColumnWidths(columns: Column[], rows: Record<string, unknown>[]): Map<string, number> {
  return new Map(columns.map((column) => [column.name, estimateColumnWidth(column.name, rows, column.name)]));
}

function estimateColumnWidth(header: string, rows: Record<string, unknown>[], columnName: string): number {
  const sampledRows = rows.slice(0, 200);
  const maxValueLength = sampledRows.reduce((maxLength, row) => {
    const currentLength = formatCellValue(row[columnName]).length;
    return Math.max(maxLength, currentLength);
  }, header.length);

  const baseWidth = Math.max(header.length, maxValueLength, 6) * 7.4;
  return Math.max(96, Math.min(420, Math.round(baseWidth + 34)));
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
