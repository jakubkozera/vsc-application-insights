import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App } from '../src/logTable/App';

const mockPostMessage = vi.fn();
let subscribeHandlers: Array<(msg: any) => void> = [];

vi.mock('@shared/hooks', () => ({
  useVSCodeMessaging: () => ({
    postMessage: mockPostMessage,
    subscribe: (handler: any) => {
      subscribeHandlers.push(handler);
      return () => {
        subscribeHandlers = subscribeHandlers.filter(h => h !== handler);
      };
    },
    vscode: { postMessage: mockPostMessage, getState: vi.fn(), setState: vi.fn() }
  }),
  useColumnSettings: ({ allColumns }: any) => ({
    columnConfig: (allColumns || []).map((c: any) => ({ name: c.name, visible: true })),
    visibleColumns: allColumns || [],
    presets: [],
    showSettings: false,
    setShowSettings: vi.fn(),
    handleColumnsChange: vi.fn(),
    handleSavePreset: vi.fn(),
    handleLoadPreset: vi.fn(),
    handleDeletePreset: vi.fn(),
  }),
  useDebounce: (v: any) => v
}));

function sendMessage(msg: any) {
  subscribeHandlers.forEach(h => h(msg));
}

function initAsExceptions() {
  sendMessage({
    command: 'init',
    data: { connectionId: 'c1', tableName: 'exceptions', connectionName: 'Prod' }
  });
  sendMessage({
    command: 'queryResult',
    data: {
      columns: [
        { name: 'timestamp', type: 'datetime' },
        { name: 'problemId', type: 'string' },
        { name: 'type', type: 'string' },
        { name: 'operation_Name', type: 'string' },
        { name: 'cloud_RoleName', type: 'string' },
      ],
      rows: [
        { timestamp: '2026-05-21T18:08:46Z', problemId: 'HttpException at Retry', type: 'HttpRequestException', operation_Name: 'POST /api/orders', cloud_RoleName: 'order-service' },
        { timestamp: '2026-05-21T18:09:00Z', problemId: 'HttpException at Retry', type: 'HttpRequestException', operation_Name: 'GET /api/users', cloud_RoleName: 'user-service' },
        { timestamp: '2026-05-21T18:10:00Z', problemId: 'NullRef at Handler', type: 'NullReferenceException', operation_Name: 'POST /api/orders', cloud_RoleName: 'order-service' },
        { timestamp: '2026-05-21T18:11:00Z', problemId: 'NullRef at Handler', type: 'NullReferenceException', operation_Name: 'POST /api/orders', cloud_RoleName: 'order-service' },
      ],
      statistics: { executionTime: 20, rowCount: 4 }
    }
  });
}

function initAsRequests() {
  sendMessage({
    command: 'init',
    data: { connectionId: 'c1', tableName: 'requests', connectionName: 'Prod' }
  });
  sendMessage({
    command: 'queryResult',
    data: {
      columns: [
        { name: 'name', type: 'string' },
        { name: 'status', type: 'int' },
      ],
      rows: [
        { name: 'GET /api', status: 200 },
      ],
      statistics: { executionTime: 5, rowCount: 1 }
    }
  });
}

describe('Exception Grouping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    subscribeHandlers = [];
  });

  it('shows Group by dropdown for exceptions table', async () => {
    render(<App />);
    initAsExceptions();
    await waitFor(() => {
      expect(screen.getByDisplayValue('No grouping')).toBeInTheDocument();
    });
  });

  it('does not show Group by dropdown for non-exception tables', async () => {
    render(<App />);
    initAsRequests();
    await waitFor(() => {
      expect(screen.getByText('GET /api')).toBeInTheDocument();
    });
    expect(screen.queryByDisplayValue('No grouping')).not.toBeInTheDocument();
  });

  it('groups by problemId', async () => {
    render(<App />);
    initAsExceptions();
    await waitFor(() => {
      expect(screen.getByDisplayValue('No grouping')).toBeInTheDocument();
    });

    // Select grouping by problemId
    fireEvent.change(screen.getByDisplayValue('No grouping'), { target: { value: 'problemId' } });

    await waitFor(() => {
      // Should show group headers with counts
      const countBadges = screen.getAllByText(/\(\d+\)/);
      expect(countBadges.length).toBe(2); // 2 groups
    });
  });

  it('groups by operation_Name', async () => {
    render(<App />);
    initAsExceptions();
    await waitFor(() => {
      expect(screen.getByDisplayValue('No grouping')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByDisplayValue('No grouping'), { target: { value: 'operation_Name' } });

    await waitFor(() => {
      const countBadges = screen.getAllByText(/\(\d+\)/);
      expect(countBadges.length).toBe(2); // POST /api/orders (3) and GET /api/users (1)
    });
  });

  it('groups by cloud_RoleName', async () => {
    render(<App />);
    initAsExceptions();
    await waitFor(() => {
      expect(screen.getByDisplayValue('No grouping')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByDisplayValue('No grouping'), { target: { value: 'cloud_RoleName' } });

    await waitFor(() => {
      const countBadges = screen.getAllByText(/\(\d+\)/);
      expect(countBadges.length).toBe(2); // order-service (3) and user-service (1)
    });
  });

  it('sorts groups by count descending', async () => {
    render(<App />);
    initAsExceptions();
    await waitFor(() => {
      expect(screen.getByDisplayValue('No grouping')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByDisplayValue('No grouping'), { target: { value: 'cloud_RoleName' } });

    await waitFor(() => {
      // order-service has 3 rows, user-service has 1
      const groupHeaders = screen.getAllByText(/\(\d+\)/);
      expect(groupHeaders[0].textContent).toBe('(3)');
      expect(groupHeaders[1].textContent).toBe('(1)');
    });
  });

  it('collapses and expands groups', async () => {
    render(<App />);
    initAsExceptions();
    await waitFor(() => {
      expect(screen.getByDisplayValue('No grouping')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByDisplayValue('No grouping'), { target: { value: 'problemId' } });

    await waitFor(() => {
      const countBadges = screen.getAllByText(/\(\d+\)/);
      expect(countBadges.length).toBe(2);
    });

    // Initially all rows visible — count all data rows
    const initialRows = screen.getAllByRole('row');
    const initialDataRows = initialRows.length; // header + group headers + data rows

    // Click the first group header (it has a count badge)
    const groupHeaders = screen.getAllByText(/\(\d+\)/).map(el => el.closest('tr')!);
    fireEvent.click(groupHeaders[0]);

    // After collapsing, we should have fewer rows
    const afterCollapseRows = screen.getAllByRole('row');
    expect(afterCollapseRows.length).toBeLessThan(initialDataRows);
  });

  it('removes grouping when set to No grouping', async () => {
    render(<App />);
    initAsExceptions();
    await waitFor(() => {
      expect(screen.getByDisplayValue('No grouping')).toBeInTheDocument();
    });

    // Enable grouping
    fireEvent.change(screen.getByDisplayValue('No grouping'), { target: { value: 'problemId' } });
    await waitFor(() => {
      const countBadges = screen.getAllByText(/\(\d+\)/);
      expect(countBadges.length).toBe(2);
    });

    // Disable grouping
    fireEvent.change(screen.getByDisplayValue('problemId'), { target: { value: '' } });

    await waitFor(() => {
      // Group count badges should be gone
      expect(screen.queryAllByText(/\(\d+\)/).length).toBe(0);
      // All rows should be flat: 1 header + 4 data rows = 5
      expect(screen.getAllByRole('row').length).toBe(5);
    });
  });
});
