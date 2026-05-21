import { useCallback, useEffect, useState } from 'react';
import { ColumnConfig, ColumnPreset } from '@shared/components';

interface Column {
  name: string;
  type: string;
}

interface UseColumnSettingsOptions {
  /** All columns from the query result */
  allColumns: Column[];
  /** postMessage to extension backend */
  postMessage: (msg: any) => void;
  /** subscribe to messages from backend */
  subscribe: (handler: (msg: any) => void) => () => void;
}

interface UseColumnSettingsReturn {
  /** Column config (order + visibility) */
  columnConfig: ColumnConfig[];
  /** Visible columns in order */
  visibleColumns: Column[];
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
}

export function useColumnSettings({ allColumns, postMessage, subscribe }: UseColumnSettingsOptions): UseColumnSettingsReturn {
  const [columnConfig, setColumnConfig] = useState<ColumnConfig[]>([]);
  const [presets, setPresets] = useState<ColumnPreset[]>([]);
  const [showSettings, setShowSettings] = useState(false);

  // Initialize column config when allColumns change
  useEffect(() => {
    if (allColumns.length === 0) return;
    setColumnConfig(prev => {
      // Preserve existing visibility/order if columns haven't changed
      if (prev.length > 0) {
        const existingNames = new Set(prev.map(c => c.name));
        const newCols = allColumns.filter(c => !existingNames.has(c.name));
        if (newCols.length === 0 && prev.length === allColumns.length) return prev;
        // Merge: keep existing order, add new ones at end
        const merged = prev.filter(c => allColumns.some(ac => ac.name === c.name));
        newCols.forEach(c => merged.push({ name: c.name, visible: true }));
        return merged;
      }
      return allColumns.map(c => ({ name: c.name, visible: true }));
    });
  }, [allColumns]);

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
    // First: columns in preset order (visible)
    for (const name of preset.columns) {
      if (allColumns.some(c => c.name === name)) {
        ordered.push({ name, visible: true });
      }
    }
    // Then: remaining columns (hidden)
    for (const col of allColumns) {
      if (!presetSet.has(col.name)) {
        ordered.push({ name: col.name, visible: false });
      }
    }
    setColumnConfig(ordered);
    setShowSettings(false);
  }, [allColumns]);

  const handleDeletePreset = useCallback((id: string) => {
    postMessage({ command: 'deleteColumnPreset', id });
    setPresets(prev => prev.filter(p => p.id !== id));
  }, [postMessage]);

  const visibleColumns = columnConfig
    .filter(c => c.visible)
    .map(c => allColumns.find(ac => ac.name === c.name)!)
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
  };
}
