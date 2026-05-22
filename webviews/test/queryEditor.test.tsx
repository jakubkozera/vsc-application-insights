import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App } from '../src/queryEditor/App';

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
        <div>
          {columns.map((column: any) => (
            <div key={`header-${column.id}`}>{column.header}</div>
          ))}
        </div>
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

describe('QueryEditor App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubscribe.mockImplementation((handler: any) => {
      setTimeout(() => {
        handler({
          command: 'init',
          data: {
            connectionId: 'c1',
            connectionName: 'Prod',
            connections: [{ id: 'c1', name: 'Prod' }, { id: 'c2', name: 'Dev' }]
          }
        });
      }, 0);
      return () => {};
    });
  });

  it('renders and sends webviewReady', () => {
    render(<App />);
    expect(mockPostMessage).toHaveBeenCalledWith({ command: 'webviewReady' });
  });

  it('renders the Run button', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('Run')).toBeInTheDocument();
    });
  });

  it('renders the Save button', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('Save')).toBeInTheDocument();
    });
  });

  it('has an editor textarea', async () => {
    render(<App />);
    expect(screen.getByPlaceholderText(/Search across traces/)).toBeInTheDocument();
  });

  it('does not show KQL preview in search mode', () => {
    render(<App />);
    expect(screen.queryByText(/union isfuzzy=true/)).not.toBeInTheDocument();
  });

  it('sends runQuery with generated union KQL in search mode', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('Run')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search across traces/);
    fireEvent.change(searchInput, { target: { value: 'project' } });

    const runBtn = screen.getByText('Run');
    fireEvent.click(runBtn);

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'runQuery',
        kql: expect.stringContaining('union isfuzzy=true'),
        timeRange: { range: '24h' }
      })
    );
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        kql: expect.stringContaining('| where * has "project"')
      })
    );
  });

  it('sends saveQuery when Save is clicked in kql mode', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('Save')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('tab', { name: 'KQL mode' }));

    const textarea = screen.getByPlaceholderText(/Enter your KQL query/);
    fireEvent.change(textarea, { target: { value: 'exceptions | take 5' } });

    const saveBtn = screen.getByText('Save');
    fireEvent.click(saveBtn);

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'saveQuery',
        kql: 'exceptions | take 5'
      })
    );
  });

  it('displays results after query', async () => {
    mockSubscribe.mockImplementation((handler: any) => {
      setTimeout(() => {
        handler({
          command: 'init',
          data: {
            connectionId: 'c1',
            connectionName: 'Prod',
            connections: [{ id: 'c1', name: 'Prod' }]
          }
        });
        handler({
          command: 'queryResult',
          data: {
            columns: [{ name: 'timestamp', type: 'datetime' }, { name: 'message', type: 'string' }],
            rows: [{ timestamp: '2024-01-01', message: 'Hello world' }],
            statistics: { executionTime: 55, rowCount: 1 }
          }
        });
      }, 0);
      return () => {};
    });

    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('1 rows • 55ms')).toBeInTheDocument();
      expect(screen.getByText('Hello world')).toBeInTheDocument();
    });
  });

  it('renders a datetime filter input for timestamp columns', async () => {
    mockSubscribe.mockImplementation((handler: any) => {
      setTimeout(() => {
        handler({
          command: 'init',
          data: {
            connectionId: 'c1',
            connectionName: 'Prod',
            connections: [{ id: 'c1', name: 'Prod' }]
          }
        });
        handler({
          command: 'queryResult',
          data: {
            columns: [{ name: 'timestamp', type: 'datetime' }, { name: 'message', type: 'string' }],
            rows: [{ timestamp: '2026-05-22T12:00:00.0000000Z', message: 'Hello world' }],
            statistics: { executionTime: 55, rowCount: 1 }
          }
        });
      }, 0);
      return () => {};
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText('Filter timestamp')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Filter timestamp'));

    const input = await screen.findByLabelText('Filter timestamp value');
    expect(input).toHaveAttribute('type', 'datetime-local');
  });

  it('filters string columns by checked value list items', async () => {
    mockSubscribe.mockImplementation((handler: any) => {
      setTimeout(() => {
        handler({
          command: 'init',
          data: {
            connectionId: 'c1',
            connectionName: 'Prod',
            connections: [{ id: 'c1', name: 'Prod' }]
          }
        });
        handler({
          command: 'queryResult',
          data: {
            columns: [{ name: 'source', type: 'string' }, { name: 'message', type: 'string' }],
            rows: [
              { source: 'api', message: 'First row' },
              { source: 'worker', message: 'Second row' }
            ],
            statistics: { executionTime: 55, rowCount: 2 }
          }
        });
      }, 0);
      return () => {};
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText('Filter source')).toBeInTheDocument();
      expect(screen.getByText('First row')).toBeInTheDocument();
      expect(screen.getByText('Second row')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Filter source'));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'worker' }));

    await waitFor(() => {
      expect(screen.getByText('First row')).toBeInTheDocument();
      expect(screen.queryByText('Second row')).not.toBeInTheDocument();
    });
  });

  it('inserts sample query when sample button is clicked', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'KQL mode' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('tab', { name: 'KQL mode' }));

    const sampleBtn = screen.getByText('requests');
    fireEvent.click(sampleBtn);

    const textarea = screen.getByPlaceholderText(/Enter your KQL query/) as HTMLTextAreaElement;
    expect(textarea.value).toContain('requests');
    expect(textarea.value).toContain('ago(24h)');
    expect(textarea.value).toContain('order by timestamp desc');
    expect(textarea.value).not.toContain('top 50');
  });

  it('shows initialQuery when provided', async () => {
    mockSubscribe.mockImplementation((handler: any) => {
      setTimeout(() => {
        handler({
          command: 'init',
          data: {
            connectionId: 'c1',
            connectionName: 'Prod',
            connections: [{ id: 'c1', name: 'Prod' }],
            initialQuery: 'traces | take 100'
          }
        });
      }, 0);
      return () => {};
    });

    render(<App />);
    await waitFor(() => {
      const textarea = screen.getByPlaceholderText(/Enter your KQL query/) as HTMLTextAreaElement;
      expect(textarea.value).toBe('traces | take 100');
    });
  });

  it('renders KQL editor with line numbers and highlighted content', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('tab', { name: 'KQL mode' }));

    const textarea = screen.getByPlaceholderText(/Enter your KQL query/) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'requests\n| where timestamp > ago(24h)' } });

    const lineNumbers = screen.getByTestId('kql-line-numbers');
    const highlight = screen.getByTestId('kql-editor-highlight');

    await waitFor(() => {
      expect(lineNumbers).toHaveTextContent('1');
      expect(lineNumbers).toHaveTextContent('2');
      expect(highlight).toHaveTextContent('requests');
      expect(highlight).toHaveTextContent('where timestamp > ago(24h)');
    });
  });
});
