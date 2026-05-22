import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CodeViewer } from '../CodeViewer/CodeViewer';
import { CallStack } from '../CallStack/CallStack';
import { IconCopy, IconX } from '@tabler/icons-react';
import styles from './RowDetailPanel.module.css';

interface Tab {
  label: string;
  content: string;
  type?: 'json' | 'callstack';
}

export interface RowDetailPanelProps {
  row: Record<string, unknown>;
  onClose?: () => void;
}

function hasCallStack(row: Record<string, unknown>): boolean {
  const details = row.details;
  if (typeof details !== 'string' || !details) return false;
  try {
    const parsed = JSON.parse(details);
    const items = Array.isArray(parsed) ? parsed : [parsed];
    return items.some(item => Array.isArray(item.parsedStack) && item.parsedStack.length > 0);
  } catch {
    return false;
  }
}

function buildInitialTabs(row: Record<string, unknown>): Tab[] {
  const tabs: Tab[] = [{ label: 'Row', content: JSON.stringify(row, null, 2), type: 'json' }];
  if (hasCallStack(row)) {
    tabs.push({ label: 'Call Stack', content: row.details as string, type: 'callstack' });
  }
  return tabs;
}

export const RowDetailPanel: React.FC<RowDetailPanelProps> = ({ row, onClose }) => {
  const [tabs, setTabs] = useState<Tab[]>(() => buildInitialTabs(row));
  const [activeTab, setActiveTab] = useState(() => hasCallStack(row) ? 1 : 0);
  const [panelHeight, setPanelHeight] = useState(300);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startHeight: panelHeight };

    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startY - ev.clientY;
      const newHeight = Math.max(120, Math.min(window.innerHeight * 0.8, dragRef.current.startHeight + delta));
      setPanelHeight(newHeight);
    };

    const handleMouseUp = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [panelHeight]);

  const handleJsonStringClick = useCallback((key: string, rawValue: string) => {
    // Try to pretty-print the JSON
    let content: string;
    try {
      const parsed = JSON.parse(rawValue);
      content = JSON.stringify(parsed, null, 2);
    } catch {
      content = rawValue;
    }

    // Check if tab already exists
    const existingIdx = tabs.findIndex(t => t.label === key);
    if (existingIdx !== -1) {
      setActiveTab(existingIdx);
    } else {
      const newTabs = [...tabs, { label: key, content, type: 'json' as const }];
      setTabs(newTabs);
      setActiveTab(newTabs.length - 1);
    }
  }, [tabs]);

  const closeTab = useCallback((idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const newTabs = tabs.filter((_, i) => i !== idx);
    setTabs(newTabs);
    if (activeTab >= idx && activeTab > 0) {
      setActiveTab(activeTab - 1);
    }
  }, [tabs, activeTab]);

  const copyContent = () => {
    const content = tabs[activeTab]?.content ?? '';
    navigator.clipboard.writeText(content);
  };

  // Reset tabs when row changes
  useEffect(() => {
    const newTabs = buildInitialTabs(row);
    setTabs(newTabs);
    setActiveTab(hasCallStack(row) ? 1 : 0);
  }, [row]);

  return (
    <div className={styles.panel} style={{ height: panelHeight }}>
      <div className={styles.resizeHandle} onMouseDown={handleResizeStart} />
      <div className={styles.header}>
        <div className={styles.tabs}>
          {tabs.map((tab, idx) => (
            <button
              key={`${tab.label}-${idx}`}
              className={`${styles.tab} ${idx === activeTab ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(idx)}
            >
              <span className={styles.tabLabel}>{tab.label}</span>
              {idx > 0 && (
                <span className={styles.tabClose} onClick={(e) => closeTab(idx, e)}>
                  <IconX size={10} />
                </span>
              )}
            </button>
          ))}
        </div>
        <div className={styles.headerActions}>
          <button className={styles.actionBtn} onClick={copyContent} title="Copy as JSON">
            <IconCopy size={14} />
          </button>
          {onClose && (
            <button className={styles.actionBtn} onClick={onClose} title="Close">
              <IconX size={14} />
            </button>
          )}
        </div>
      </div>
      <div className={styles.content}>
        {tabs[activeTab]?.type === 'callstack' ? (
          <CallStack details={tabs[activeTab].content} />
        ) : (
          <CodeViewer
            value={tabs[activeTab]?.content ?? ''}
            language="json"
            onJsonStringClick={handleJsonStringClick}
          />
        )}
      </div>
    </div>
  );
};
