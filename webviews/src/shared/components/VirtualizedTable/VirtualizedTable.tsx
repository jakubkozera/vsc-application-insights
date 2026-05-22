import React, { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import styles from './VirtualizedTable.module.css';

export interface VirtualizedTableColumn<T> {
  id: string;
  header: React.ReactNode;
  renderCell: (row: T, index: number) => React.ReactNode;
  headerClassName?: string;
  cellClassName?: string;
  minWidth?: number;
  width?: string;
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
}: VirtualizedTableProps<T>) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const resolvedGridTemplateColumns = useMemo(() => {
    if (gridTemplateColumns) return gridTemplateColumns;
    return columns.map((column) => column.width ?? `minmax(${column.minWidth ?? 160}px, 1fr)`).join(' ');
  }, [columns, gridTemplateColumns]);

  const minWidth = useMemo(() => columns.reduce((sum, column) => sum + (column.minWidth ?? 160), 0), [columns]);

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