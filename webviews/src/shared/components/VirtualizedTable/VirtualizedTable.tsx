import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import styles from './VirtualizedTable.module.css';

export interface VirtualizedTableColumn<T> {
  id: string;
  header: React.ReactNode;
  renderCell: (row: T, index: number) => React.ReactNode;
  headerClassName?: string;
  cellClassName?: string;
  minWidth?: number;
  width?: string | number;
}

interface VirtualizedTableProps<T> {
  rows: T[];
  columns: VirtualizedTableColumn<T>[];
  rowKey?: (row: T, index: number) => React.Key;
  onRowClick?: (row: T, index: number) => void;
  rowClassName?: (row: T, index: number) => string | undefined;
  wrapperClassName?: string;
  headerRowClassName?: string;
  emptyState?: React.ReactNode;
  estimatedRowHeight?: number;
  overscan?: number;
  gridTemplateColumns?: string;
  ariaLabel?: string;
  testId?: string;
  onColumnResize?: (columnId: string, width: number) => void;
}

export function VirtualizedTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  rowClassName,
  wrapperClassName,
  headerRowClassName,
  emptyState,
  estimatedRowHeight = 36,
  overscan = 8,
  gridTemplateColumns,
  ariaLabel,
  testId,
  onColumnResize,
}: VirtualizedTableProps<T>) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const resizeStateRef = useRef<{ columnId: string; startX: number; startWidth: number; minWidth: number } | null>(null);

  const resolvedGridTemplateColumns = useMemo(() => {
    if (gridTemplateColumns) return gridTemplateColumns;
    return columns.map((column) => {
      if (typeof column.width === 'number') return `${column.width}px`;
      if (typeof column.width === 'string') return column.width;
      return `minmax(${column.minWidth ?? 160}px, 1fr)`;
    }).join(' ');
  }, [columns, gridTemplateColumns]);

  const minWidth = useMemo(() => columns.reduce((sum, column) => {
    if (typeof column.width === 'number') return sum + column.width;
    return sum + (column.minWidth ?? 160);
  }, 0), [columns]);

  const handleResizeStart = useCallback((event: React.MouseEvent, column: VirtualizedTableColumn<T>) => {
    if (!onColumnResize) return;
    event.preventDefault();
    event.stopPropagation();

    resizeStateRef.current = {
      columnId: column.id,
      startX: event.clientX,
      startWidth: typeof column.width === 'number' ? column.width : (column.minWidth ?? 160),
      minWidth: column.minWidth ?? 96,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const currentState = resizeStateRef.current;
      if (!currentState) return;
      const delta = moveEvent.clientX - currentState.startX;
      onColumnResize(currentState.columnId, Math.max(currentState.minWidth, currentState.startWidth + delta));
    };

    const handleMouseUp = () => {
      resizeStateRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [onColumnResize]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan,
    initialRect: { width: minWidth, height: 420 },
  });

  const items = rowVirtualizer.getVirtualItems();

  const fallbackItems = useMemo(() => {
    const viewportHeight = 420;
    const startIndex = Math.max(0, Math.floor(scrollTop / estimatedRowHeight) - overscan);
    const visibleCount = Math.ceil(viewportHeight / estimatedRowHeight) + (overscan * 2);
    const endIndex = Math.min(rows.length, startIndex + visibleCount);

    return Array.from({ length: Math.max(0, endIndex - startIndex) }, (_, offset) => {
      const index = startIndex + offset;
      return {
        key: index,
        index,
        size: estimatedRowHeight,
        start: index * estimatedRowHeight,
      };
    });
  }, [estimatedRowHeight, overscan, rows.length, scrollTop]);

  const renderedItems = items.length > 0 ? items : fallbackItems;

  return (
    <div
      ref={scrollRef}
      className={[styles.wrapper, wrapperClassName].filter(Boolean).join(' ')}
      role="table"
      aria-label={ariaLabel}
      data-testid={testId}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div className={styles.surface} style={{ minWidth }}>
        <div
          className={[styles.headerRow, headerRowClassName].filter(Boolean).join(' ')}
          style={{ gridTemplateColumns: resolvedGridTemplateColumns }}
          role="rowgroup"
        >
          {columns.map((column) => (
            <div key={column.id} className={[styles.headerCell, column.headerClassName].filter(Boolean).join(' ')} role="columnheader">
              {column.header}
              {onColumnResize && (
                <div
                  className={styles.resizeHandle}
                  onMouseDown={(event) => handleResizeStart(event, column)}
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={`Resize ${column.id} column`}
                />
              )}
            </div>
          ))}
        </div>

        {rows.length === 0 ? (
          emptyState ?? <div className={styles.empty}>No rows</div>
        ) : (
          <div className={styles.body} style={{ height: rowVirtualizer.getTotalSize() }} role="rowgroup">
            {renderedItems.map((item) => {
              const row = rows[item.index];
              return (
                <div
                  key={rowKey ? rowKey(row, item.index) : item.key}
                  className={[
                    styles.row,
                    onRowClick ? styles.clickable : '',
                    rowClassName?.(row, item.index),
                  ].filter(Boolean).join(' ')}
                  style={{
                    height: item.size,
                    transform: `translateY(${item.start}px)`,
                    gridTemplateColumns: resolvedGridTemplateColumns,
                  }}
                  onClick={onRowClick ? () => onRowClick(row, item.index) : undefined}
                  role="row"
                  data-row-index={item.index}
                >
                  {columns.map((column) => (
                    <div
                      key={column.id}
                      className={[styles.cell, column.cellClassName].filter(Boolean).join(' ')}
                      role="cell"
                    >
                      {column.renderCell(row, item.index)}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}