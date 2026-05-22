import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from '../src/failures/App';

const mockPostMessage = vi.fn();
let subscribeHandlers: Array<(msg: any) => void> = [];

vi.mock('recharts', () => {
  const React = require('react');
  const passthrough = (name: string) => ({ children, ...props }: any) => {
    const sanitized = { ...props };
    delete sanitized.syncId;
    delete sanitized.dataKey;
    delete sanitized.startIndex;
    delete sanitized.endIndex;
    delete sanitized.travellerWidth;
    return React.createElement('div', { 'data-chart': name, ...sanitized }, children);
  };
  return {
    ResponsiveContainer: ({ children }: any) => React.createElement('div', {}, children),
    AreaChart: passthrough('AreaChart'),
    Area: () => React.createElement('div', { 'data-chart': 'Area' }),
    CartesianGrid: () => React.createElement('div', { 'data-chart': 'CartesianGrid' }),
    XAxis: () => React.createElement('div', { 'data-chart': 'XAxis' }),
    YAxis: () => React.createElement('div', { 'data-chart': 'YAxis' }),
    Tooltip: () => React.createElement('div', { 'data-chart': 'Tooltip' }),
    Brush: () => React.createElement('div', { 'data-chart': 'Brush' }),
  };
});

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
  useDebounce: (value: any) => value,
}));

vi.mock('@shared/components', () => ({
  Dropdown: ({ options, value, onChange, label }: any) => (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((option: any) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  ),
  Button: ({ children, onClick, title }: any) => <button onClick={onClick} title={title}>{children}</button>,
  LoadingOverlay: ({ visible }: any) => visible ? <div>Loading...</div> : null,
  VirtualizedTable: ({ rows, columns, onRowClick }: any) => (
    <div>
      {rows.map((row: any, rowIndex: number) => (
        <div key={row.key ?? rowIndex} onClick={() => onRowClick?.(row, rowIndex)}>
          {columns.map((column: any) => (
            <div key={column.id}>{column.renderCell(row, rowIndex)}</div>
          ))}
        </div>
      ))}
    </div>
  ),
}));

function sendMessage(msg: any) {
  act(() => {
    subscribeHandlers.forEach(handler => handler(msg));
  });
}

describe('Failures App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    subscribeHandlers = [];
  });

  it('requests failures data with 24h default after init', async () => {
    render(<App />);

    expect(mockPostMessage).toHaveBeenCalledWith({ command: 'webviewReady' });

    sendMessage({ command: 'init', data: { connectionId: 'c1', connectionName: 'Prod' } });

    await waitFor(() => {
      expect(mockPostMessage).toHaveBeenCalledWith(expect.objectContaining({
        command: 'loadFailures',
        connectionId: 'c1',
        tab: 'operations',
        timeRange: { range: '24h' }
      }));
    });

    expect(mockPostMessage.mock.calls.filter(call => call[0]?.command === 'loadFailures')).toHaveLength(1);
  });

  it('renders rows and detail cards from failures data', async () => {
    render(<App />);
    sendMessage({ command: 'init', data: { connectionId: 'c1', connectionName: 'Prod' } });
    sendMessage({
      command: 'failuresData',
      data: {
        tab: 'operations',
        chart: [{ timestamp: '2026-05-22T10:00:00Z', failedCount: 5, totalCount: 20 }],
        rows: [{ key: 'GET Users/SearchUsers', label: 'GET Users/SearchUsers', failedCount: 22, totalCount: 44, failureRate: 0.5 }],
        selectedKey: 'GET Users/SearchUsers',
        selectedLabel: 'GET Users/SearchUsers',
        totals: { failedCount: 46, totalCount: 500 },
        appliedSelection: { from: '2026-05-22T10:00:00Z', to: '2026-05-22T10:00:00Z' },
        cards: [
          { title: 'Top 3 response codes', emptyText: 'none', items: [{ label: '400', count: 70 }] },
          { title: 'Top 3 exception types', emptyText: 'none', items: [] },
          { title: 'Top 3 failed dependencies', emptyText: 'none', items: [] },
        ]
      }
    });

    await waitFor(() => {
      expect(screen.getAllByText('GET Users/SearchUsers').length).toBeGreaterThan(0);
      expect(screen.getByText('Top 3 response codes')).toBeInTheDocument();
      expect(screen.getByText('400')).toBeInTheDocument();
      expect(screen.getByText('46')).toBeInTheDocument();
      expect(screen.getByText('500')).toBeInTheDocument();
    });

    expect(mockPostMessage.mock.calls.filter(call => call[0]?.command === 'loadFailures')).toHaveLength(1);
  });

  it('switches tab and requests new data', async () => {
    render(<App />);
    sendMessage({ command: 'init', data: { connectionId: 'c1', connectionName: 'Prod' } });

    await waitFor(() => {
      expect(screen.getByText('Dependencies')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Dependencies'));

    await waitFor(() => {
      expect(mockPostMessage).toHaveBeenCalledWith(expect.objectContaining({
        command: 'loadFailures',
        tab: 'dependencies'
      }));
    });
  });
});