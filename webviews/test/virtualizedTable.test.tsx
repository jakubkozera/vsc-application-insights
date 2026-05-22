import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VirtualizedTable } from '../src/shared/components';

describe('VirtualizedTable', () => {
  it('renders only a subset of rows until the table is scrolled', () => {
    const rows = Array.from({ length: 200 }, (_, index) => ({ id: index, name: `Row ${index}` }));

    render(
      <VirtualizedTable
        rows={rows}
        columns={[
          {
            id: 'name',
            header: 'Name',
            minWidth: 200,
            renderCell: (row) => row.name,
          },
        ]}
        rowKey={(row) => row.id}
        estimatedRowHeight={36}
        overscan={2}
        testId="virtualized-table"
      />
    );

    expect(screen.getByText('Row 0')).toBeInTheDocument();
    expect(screen.queryByText('Row 199')).not.toBeInTheDocument();

    const table = screen.getByTestId('virtualized-table');
    fireEvent.scroll(table, { target: { scrollTop: 7200 } });

    expect(screen.getByText('Row 199')).toBeInTheDocument();
    expect(screen.queryByText('Row 0')).not.toBeInTheDocument();
  });
});