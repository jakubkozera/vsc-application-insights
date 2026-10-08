import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TableExportControl } from '../src/shared/components/TableExportControl/TableExportControl';

const postMessage = vi.fn();

vi.mock('@shared/hooks', () => ({
  useVSCodeMessaging: () => ({ postMessage }),
}));

describe('TableExportControl', () => {
  it.each(['csv', 'excel'] as const)('sends the selected %s export request', (format) => {
    postMessage.mockClear();
    render(
      <TableExportControl
        rows={[{ name: 'GET /health', count: 12 }]}
        columns={[{ key: 'name', label: 'Name' }, { key: 'count', label: 'Count' }]}
        fileName="requests"
      />
    );

    fireEvent.click(screen.getByText(format === 'csv' ? 'CSV' : 'Excel'));

    expect(postMessage).toHaveBeenCalledWith({
      command: 'exportData',
      format,
      rows: [{ name: 'GET /health', count: 12 }],
      columns: [{ key: 'name', label: 'Name' }, { key: 'count', label: 'Count' }],
      fileName: 'requests',
    });
  });

  it('sends the current rows to Copilot analysis', () => {
    postMessage.mockClear();
    const rows = [{ timestamp: '2026-10-08T10:00:00Z', message: 'Failed request' }];
    const columns = [{ key: 'message', label: 'Message' }];
    render(<TableExportControl rows={rows} columns={columns} fileName="requests" />);

    fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));

    expect(postMessage).toHaveBeenCalledWith({ command: 'analyzeData', rows, columns, fileName: 'requests' });
  });

  it('does not render without data rows', () => {
    const { container } = render(<TableExportControl rows={[]} columns={[]} fileName="empty" />);

    expect(container).toBeEmptyDOMElement();
  });
});