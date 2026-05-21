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
  useDebounce: (v: any) => v
}));

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
    const textarea = screen.getByPlaceholderText(/Enter your KQL query/);
    expect(textarea).toBeInTheDocument();
  });

  it('sends runQuery when Run is clicked with text', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('Run')).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText(/Enter your KQL query/);
    fireEvent.change(textarea, { target: { value: 'requests | take 10' } });

    const runBtn = screen.getByText('Run');
    fireEvent.click(runBtn);

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'runQuery',
        kql: 'requests | take 10'
      })
    );
  });

  it('sends saveQuery when Save is clicked', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('Save')).toBeInTheDocument();
    });

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

  it('inserts sample query when sample button is clicked', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('requests')).toBeInTheDocument();
    });

    const sampleBtn = screen.getByText('requests');
    fireEvent.click(sampleBtn);

    const textarea = screen.getByPlaceholderText(/Enter your KQL query/) as HTMLTextAreaElement;
    expect(textarea.value).toContain('requests');
    expect(textarea.value).toContain('top 50');
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
});
