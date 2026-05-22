import React, { useCallback, useRef, useState } from 'react';
import { IconGripVertical, IconX, IconDeviceFloppy, IconTrash, IconArrowsHorizontal } from '@tabler/icons-react';
import styles from './ColumnSettingsPanel.module.css';

export interface ColumnConfig {
  name: string;
  visible: boolean;
  width?: number;
}

export interface ColumnPreset {
  id: string;
  name: string;
  columns: string[];
}

export interface ColumnSettingsPanelProps {
  columns: ColumnConfig[];
  presets: ColumnPreset[];
  onColumnsChange: (columns: ColumnConfig[]) => void;
  onSavePreset: (name: string, columns: string[]) => void;
  onLoadPreset: (preset: ColumnPreset) => void;
  onDeletePreset: (id: string) => void;
  onAutoSizeColumns: () => void;
  onClose: () => void;
}

export const ColumnSettingsPanel: React.FC<ColumnSettingsPanelProps> = ({
  columns,
  presets,
  onColumnsChange,
  onSavePreset,
  onLoadPreset,
  onDeletePreset,
  onAutoSizeColumns,
  onClose,
}) => {
  const [presetName, setPresetName] = useState('');
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const toggleColumn = (idx: number) => {
    const updated = [...columns];
    updated[idx] = { ...updated[idx], visible: !updated[idx].visible };
    onColumnsChange(updated);
  };

  const toggleAll = (visible: boolean) => {
    onColumnsChange(columns.map(c => ({ ...c, visible })));
  };

  const handleDragStart = (e: React.DragEvent, idx: number) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIdx(idx);
  };

  const handleDrop = (e: React.DragEvent, dropIdx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === dropIdx) {
      setDragIdx(null);
      setDragOverIdx(null);
      return;
    }
    const updated = [...columns];
    const [moved] = updated.splice(dragIdx, 1);
    updated.splice(dropIdx, 0, moved);
    onColumnsChange(updated);
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const handleSave = () => {
    const name = presetName.trim();
    if (!name) return;
    const visibleCols = columns.filter(c => c.visible).map(c => c.name);
    onSavePreset(name, visibleCols);
    setPresetName('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>Column Settings</h3>
          <button className={styles.closeBtn} onClick={onClose}><IconX size={14} /></button>
        </div>

        {presets.length > 0 && (
          <div className={styles.presetsSection}>
            <div className={styles.presetsLabel}>Presets</div>
            <div className={styles.presetsList}>
              {presets.map(p => (
                <div key={p.id} className={styles.presetItem}>
                  <button className={styles.presetBtn} onClick={() => onLoadPreset(p)} title={`Load "${p.name}"`}>
                    {p.name}
                  </button>
                  <button className={styles.presetDeleteBtn} onClick={() => onDeletePreset(p.id)} title="Delete preset">
                    <IconTrash size={11} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className={styles.actions}>
          <button className={styles.actionBtn} onClick={() => toggleAll(true)}>Show all</button>
          <button className={styles.actionBtn} onClick={() => toggleAll(false)}>Hide all</button>
          <button className={styles.iconActionBtn} onClick={onAutoSizeColumns} title="Adjust column widths" aria-label="Adjust column widths">
            <IconArrowsHorizontal size={13} />
          </button>
        </div>

        <div className={styles.columnList} ref={listRef}>
          {columns.map((col, idx) => (
            <div
              key={col.name}
              className={`${styles.columnItem} ${dragOverIdx === idx ? styles.dropTarget : ''} ${dragIdx === idx ? styles.dragging : ''}`}
              draggable
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={(e) => handleDrop(e, idx)}
              onDragEnd={handleDragEnd}
            >
              <span className={styles.grip}><IconGripVertical size={12} /></span>
              <label className={styles.columnLabel}>
                <input
                  type="checkbox"
                  checked={col.visible}
                  onChange={() => toggleColumn(idx)}
                  className={styles.checkbox}
                />
                {col.name}
              </label>
            </div>
          ))}
        </div>

        <div className={styles.saveSection}>
          <input
            className={styles.presetNameInput}
            placeholder="Preset name…"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button className={styles.saveBtn} onClick={handleSave} disabled={!presetName.trim()} title="Save preset">
            <IconDeviceFloppy size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
