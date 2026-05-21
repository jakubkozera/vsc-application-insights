import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App } from '../src/logTable/App';

const mockPostMessage = vi.fn();
let subscribeHandlers: Array<(msg: any) => void> = [];

// Track column settings state across renders
let columnSettingsState = {
  columnConfig: [] as any[],
  visibleColumns: [] as any[],
  presets: [] as any[],
  showSettings: false,
};

const mockSetShowSettings = vi.fn((show: boolean) => {
  columnSettingsState.showSettings = show;
});
const mockHandleColumnsChange = vi.fn();
const mockHandleSavePreset = vi.fn();
const mockHandleLoadPreset = vi.fn();
const mockHandleDeletePreset = vi.fn();

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
  useColumnSettings: ({ allColumns }: any) => {
    // Only build default config if not overridden in the test
    if (columnSettingsState.columnConfig.length === 0 && allColumns.length > 0) {
      columnSettingsState.columnConfig = allColumns.map((c: any) => ({ name: c.name, visible: true }));
      columnSettingsState.visibleColumns = allColumns;
    }
    return {
      ...columnSettingsState,
      setShowSettings: mockSetShowSettings,
      handleColumnsChange: mockHandleColumnsChange,
      handleSavePreset: mockHandleSavePreset,
      handleLoadPreset: mockHandleLoadPreset,
      handleDeletePreset: mockHandleDeletePreset,
    };
  },
  useDebounce: (v: any) => v
}));

function sendMessage(msg: any) {
  subscribeHandlers.forEach(h => h(msg));
}

function initWithData() {
  sendMessage({
    command: 'init',
    data: { connectionId: 'c1', tableName: 'requests', connectionName: 'Test' }
  });
  sendMessage({
    command: 'queryResult',
    data: {
      columns: [
        { name: 'timestamp', type: 'datetime' },
        { name: 'name', type: 'string' },
        { name: 'status', type: 'int' },
        { name: 'duration', type: 'real' }
      ],
      rows: [
        { timestamp: '2024-01-01', name: 'GET /api', status: 200, duration: 42.5 }
      ],
      statistics: { executionTime: 15, rowCount: 1 }
    }
  });
}

describe('Column Settings Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    subscribeHandlers = [];
    columnSettingsState = {
      columnConfig: [],
      visibleColumns: [],
      presets: [],
      showSettings: false,
    };
  });

  it('renders settings button', async () => {
    render(<App />);
    initWithData();
    await waitFor(() => {
      expect(screen.getByTitle('Column settings')).toBeInTheDocument();
    });
  });

  it('calls setShowSettings when button clicked', async () => {
    render(<App />);
    initWithData();
    await waitFor(() => {
      expect(screen.getByTitle('Column settings')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTitle('Column settings'));
    expect(mockSetShowSettings).toHaveBeenCalledWith(true);
  });

  it('shows all columns as table headers', async () => {
    render(<App />);
    initWithData();
    await waitFor(() => {
      const headers = screen.getAllByRole('columnheader');
      const headerTexts = headers.map(h => h.textContent);
      expect(headerTexts).toContain('timestamp');
      expect(headerTexts).toContain('name');
      expect(headerTexts).toContain('status');
      expect(headerTexts).toContain('duration');
    });
  });

  it('only shows visible columns when some hidden', async () => {
    // Override to hide 'duration'
    columnSettingsState.visibleColumns = [
      { name: 'timestamp', type: 'datetime' },
      { name: 'name', type: 'string' },
      { name: 'status', type: 'int' }
    ];
    columnSettingsState.columnConfig = [
      { name: 'timestamp', visible: true },
      { name: 'name', visible: true },
      { name: 'status', visible: true },
      { name: 'duration', visible: false }
    ];

    render(<App />);
    initWithData();
    await waitFor(() => {
      const headers = screen.getAllByRole('columnheader');
      const headerTexts = headers.map(h => h.textContent);
      expect(headerTexts).toContain('timestamp');
      expect(headerTexts).toContain('name');
      expect(headerTexts).toContain('status');
      expect(headerTexts).not.toContain('duration');
    });
  });

  it('renders ColumnSettingsPanel when showSettings is true', async () => {
    columnSettingsState.showSettings = true;
    render(<App />);
    initWithData();
    await waitFor(() => {
      expect(screen.getByText('Column Settings')).toBeInTheDocument();
    });
  });
});
