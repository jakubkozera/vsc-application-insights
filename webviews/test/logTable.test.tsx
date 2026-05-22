import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { App } from '../src/logTable/App';

// Mock the messaging hook
const mockPostMessage = vi.fn();
const mockSubscribe = vi.fn();

vi.mock('@shared/hooks', () => ({
  useVSCodeMessaging: () => ({
    postMessage: mockPostMessage,
    subscribe: mockSubscribe,
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

vi.mock('@shared/components', async () => {
  const actual = await vi.importActual<any>('../src/shared/components');
  return {
    ...actual,
    VirtualizedTable: ({ rows, columns, onRowClick }: any) => (
      <div>
        {rows.map((row: any, rowIndex: number) => (
          <div key={rowIndex} onClick={() => onRowClick?.(row, rowIndex)}>
            {columns.map((column: any) => (
              <div key={column.id}>{column.renderCell(row, rowIndex)}</div>
            ))}
          </div>
        ))}
      </div>
    )
  };
});

describe('LogTable App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubscribe.mockImplementation((handler: any) => {
      // Simulate init message
      setTimeout(() => {
        handler({
          command: 'init',
          data: { connectionId: 'c1', tableName: 'requests', connectionName: 'Prod' }
        });
      }, 0);
      return () => {};
    });
  });

  it('renders and sends webviewReady', () => {
    render(<App />);
    expect(mockPostMessage).toHaveBeenCalledWith({ command: 'webviewReady' });
  });

  it('displays table name after init', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('requests')).toBeInTheDocument();
    });
  });

  it('sends query on init', async () => {
    render(<App />);
    await waitFor(() => {
      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'query',
          timeRange: { range: '24h' }
        })
      );
    });

    expect(mockPostMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ top: 50 })
    );
  });

  it('displays results when received', async () => {
    mockSubscribe.mockImplementation((handler: any) => {
      setTimeout(() => {
        handler({
          command: 'init',
          data: { connectionId: 'c1', tableName: 'requests', connectionName: 'Prod' }
        });
        handler({
          command: 'queryResult',
          data: {
            columns: [{ name: 'name', type: 'string' }, { name: 'status', type: 'int' }],
            rows: [{ name: 'GET /api', status: 200 }],
            statistics: { executionTime: 42, rowCount: 1 }
          }
        });
      }, 0);
      return () => {};
    });

    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('1 rows • 42ms')).toBeInTheDocument();
      expect(screen.getByText('GET /api')).toBeInTheDocument();
    });
  });

  it('displays error when query fails', async () => {
    let messageHandler: any;
    mockSubscribe.mockImplementation((handler: any) => {
      messageHandler = handler;
      setTimeout(() => {
        handler({
          command: 'init',
          data: { connectionId: 'c1', tableName: 'requests', connectionName: 'Prod' }
        });
      }, 0);
      return () => {};
    });

    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('requests')).toBeInTheDocument();
    });

    // Simulate error arriving after query was sent
    act(() => {
      messageHandler({
        command: 'queryError',
        error: 'Syntax error in query'
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Syntax error in query')).toBeInTheDocument();
    });
  });

  it('filters rows based on input', async () => {
    mockSubscribe.mockImplementation((handler: any) => {
      setTimeout(() => {
        handler({
          command: 'init',
          data: { connectionId: 'c1', tableName: 'requests', connectionName: 'Prod' }
        });
        handler({
          command: 'queryResult',
          data: {
            columns: [{ name: 'name', type: 'string' }],
            rows: [{ name: 'GET /api/users' }, { name: 'POST /api/orders' }],
            statistics: { executionTime: 10, rowCount: 2 }
          }
        });
      }, 0);
      return () => {};
    });

    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('GET /api/users')).toBeInTheDocument();
    });

    const filterInput = screen.getByPlaceholderText('Filter results...');
    fireEvent.change(filterInput, { target: { value: 'orders' } });

    expect(screen.queryByText('GET /api/users')).not.toBeInTheDocument();
    expect(screen.getByText('POST /api/orders')).toBeInTheDocument();
  });
});
