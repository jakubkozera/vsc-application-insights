import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Brush,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { IconRefresh } from '@tabler/icons-react';
import { Button, Dropdown, LoadingOverlay, VirtualizedTable } from '@shared/components';
import { useVSCodeMessaging } from '@shared/hooks';
import styles from './Failures.module.css';

type FailuresTab = 'operations' | 'dependencies' | 'exceptions' | 'roles';

interface InitData {
  connectionId: string;
  connectionName: string;
}

interface FailuresSelection {
  from: string;
  to: string;
}

interface FailuresChartPoint {
  timestamp: string;
  failedCount: number;
  totalCount: number;
}

interface FailuresRow {
  key: string;
  label: string;
  failedCount: number;
  totalCount: number;
  failureRate: number;
}

interface FailuresCardItem {
  label: string;
  count: number;
}

interface FailuresCard {
  title: string;
  items: FailuresCardItem[];
  emptyText: string;
}

interface FailuresData {
  tab: FailuresTab;
  chart: FailuresChartPoint[];
  rows: FailuresRow[];
  selectedKey?: string;
  selectedLabel?: string;
  cards: FailuresCard[];
  totals: { failedCount: number; totalCount: number };
  appliedSelection?: FailuresSelection;
}

interface BrushWindow {
  startIndex: number;
  endIndex: number;
}

const TIME_RANGES = [
  { label: 'Last 30 min', value: '30m' },
  { label: 'Last 1 hour', value: '1h' },
  { label: 'Last 6 hours', value: '6h' },
  { label: 'Last 24 hours', value: '24h' },
  { label: 'Last 7 days', value: '7d' },
];

const TABS: Array<{ id: FailuresTab; label: string; rowLabel: string }> = [
  { id: 'operations', label: 'Operations', rowLabel: 'operation' },
  { id: 'dependencies', label: 'Dependencies', rowLabel: 'dependency' },
  { id: 'exceptions', label: 'Exceptions', rowLabel: 'exception type' },
  { id: 'roles', label: 'Roles', rowLabel: 'role' },
];

const DEFAULT_TIME_RANGE = '6h';

export const App: React.FC = () => {
  const { postMessage, subscribe } = useVSCodeMessaging<any, any>();
  const [initData, setInitData] = useState<InitData | null>(null);
  const [activeTab, setActiveTab] = useState<FailuresTab>('operations');
  const [timeRange, setTimeRange] = useState(DEFAULT_TIME_RANGE);
  const [data, setData] = useState<FailuresData | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [brushWindow, setBrushWindow] = useState<BrushWindow | null>(null);

  const requestLoad = useCallback((overrides?: { selection?: FailuresSelection; selectedKey?: string }) => {
    if (!initData) return;
    setLoading(true);
    setError(null);
    postMessage({
      command: 'loadFailures',
      connectionId: initData.connectionId,
      tab: activeTab,
      timeRange: { range: timeRange },
      selection: overrides?.selection,
      selectedKey: overrides?.selectedKey,
    });
  }, [activeTab, initData, postMessage, timeRange]);

  useEffect(() => {
    const unsub = subscribe((msg) => {
      if (msg.command === 'init') {
        setInitData(msg.data as InitData);
      } else if (msg.command === 'failuresData') {
        setData(msg.data as FailuresData);
        setLoading(false);
        setError(null);
      } else if (msg.command === 'failuresError') {
        setError(msg.error);
        setLoading(false);
      }
    });
    postMessage({ command: 'webviewReady' });
    return unsub;
  }, [postMessage, subscribe]);

  useEffect(() => {
    if (!initData) return;
    setBrushWindow(null);
    setData(null);
    requestLoad();
  }, [initData, activeTab, timeRange, requestLoad]);

  const filteredRows = useMemo(() => {
    const rows = data?.rows ?? [];
    if (!search) return rows;
    const needle = search.toLowerCase();
    return rows.filter(row => row.label.toLowerCase().includes(needle));
  }, [data?.rows, search]);

  const activeTabMeta = TABS.find(tab => tab.id === activeTab)!;
  const selectedRow = useMemo(() => {
    const rows = data?.rows ?? [];
    return rows.find(row => row.key === data?.selectedKey);
  }, [data]);

  const chartData = useMemo(() => (data?.chart ?? []).map(point => ({
    ...point,
    label: formatAxisTime(point.timestamp)
  })), [data?.chart]);

  const resolvedBrushWindow = useMemo(() => {
    if (brushWindow) return brushWindow;
    if (!data || data.chart.length === 0) return null;
    return getBrushWindowFromSelection(data.chart, data.appliedSelection) ?? getDefaultBrushWindow(data.chart.length);
  }, [brushWindow, data]);

  const appliedRangeLabel = useMemo(() => formatSelectionLabel(data?.appliedSelection), [data?.appliedSelection]);

  const tableColumns = useMemo(() => [
    {
      id: 'label',
      headerClassName: styles.th,
      cellClassName: `${styles.td} ${styles.labelCell}`,
      minWidth: 320,
      header: 'Name',
      renderCell: (row: FailuresRow) => row.label,
    },
    {
      id: 'failedCount',
      headerClassName: styles.th,
      cellClassName: styles.td,
      minWidth: 140,
      header: 'Count (failed)',
      renderCell: (row: FailuresRow) => formatCount(row.failedCount),
    },
    {
      id: 'totalCount',
      headerClassName: styles.th,
      cellClassName: styles.td,
      minWidth: 120,
      header: 'Count',
      renderCell: (row: FailuresRow) => formatCount(row.totalCount),
    },
    {
      id: 'failureRate',
      headerClassName: styles.th,
      cellClassName: styles.td,
      minWidth: 140,
      header: 'Failure rate',
      renderCell: (row: FailuresRow) => formatPercent(row.failureRate),
    },
  ], []);

  return (
    <div className={styles.container}>
      <LoadingOverlay visible={loading} message="Loading failures..." />

      <div className={styles.topbar}>
        <div className={styles.titleBlock}>
          <div className={styles.title}>Failures</div>
          <div className={styles.subtitle}>{initData?.connectionName ?? 'Loading connection...'}</div>
        </div>
        <div className={styles.topbarRight}>
          <Dropdown options={TIME_RANGES} value={timeRange} onChange={setTimeRange} label="Time:" />
          <Button variant="icon" onClick={() => requestLoad({ selection: currentSelection(data, chartData, resolvedBrushWindow), selectedKey: data?.selectedKey })} title="Refresh">
            <IconRefresh size={16} />
          </Button>
        </div>
      </div>

      <div className={styles.tabs}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`${styles.tab} ${tab.id === activeTab ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={styles.summaryBar}>
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>Failed count</div>
          <div className={styles.summaryValue}>{formatCount(data?.totals.failedCount ?? 0)}</div>
          <div className={styles.summaryHint}>{appliedRangeLabel}</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>Total count</div>
          <div className={styles.summaryValue}>{formatCount(data?.totals.totalCount ?? 0)}</div>
          <div className={styles.summaryHint}>Current data window</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>Failure rate</div>
          <div className={styles.summaryValue}>{formatPercent(rate(data?.totals.failedCount ?? 0, data?.totals.totalCount ?? 0))}</div>
          <div className={styles.summaryHint}>Selected period</div>
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.content}>
        <div className={styles.main}>
          <div className={styles.chartSection}>
            <div className={styles.chartTitle}>Failed count over time</div>
            <div className={styles.chartPanel}>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartData} syncId="failures-timeline">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--vscode-panel-border)" />
                  <XAxis dataKey="label" minTickGap={24} tick={{ fill: 'var(--vscode-descriptionForeground)', fontSize: 11 }} />
                  <YAxis tick={{ fill: 'var(--vscode-descriptionForeground)', fontSize: 11 }} width={48} />
                  <Tooltip content={<FailuresTooltip />} />
                  <Area type="monotone" dataKey="failedCount" stroke="#f45454" fill="rgba(244, 84, 84, 0.35)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
              <ResponsiveContainer width="100%" height={120}>
                <AreaChart data={chartData} syncId="failures-timeline">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--vscode-panel-border)" />
                  <XAxis dataKey="label" minTickGap={24} tick={{ fill: 'var(--vscode-descriptionForeground)', fontSize: 11 }} />
                  <YAxis tick={{ fill: 'var(--vscode-descriptionForeground)', fontSize: 11 }} width={48} />
                  <Tooltip content={<FailuresTooltip />} />
                  <Area type="monotone" dataKey="totalCount" stroke="#3fb950" fill="rgba(63, 185, 80, 0.25)" strokeWidth={2} />
                  <Brush
                    dataKey="label"
                    height={28}
                    travellerWidth={12}
                    startIndex={resolvedBrushWindow?.startIndex}
                    endIndex={resolvedBrushWindow?.endIndex}
                    onChange={(next) => {
                      if (typeof next?.startIndex !== 'number' || typeof next?.endIndex !== 'number') return;
                      const nextWindow = { startIndex: next.startIndex, endIndex: next.endIndex };
                      setBrushWindow(nextWindow);
                      const selection = selectionFromBrush(data?.chart ?? [], nextWindow);
                      if (!selection) return;
                      if (data?.appliedSelection?.from === selection.from && data?.appliedSelection?.to === selection.to) return;
                      requestLoad({ selection, selectedKey: data?.selectedKey });
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
              <div className={styles.chartRange}>{appliedRangeLabel}</div>
            </div>
          </div>

          <div className={styles.tableHeader}>
            <div className={styles.sectionTitle}>Select {activeTabMeta.rowLabel}</div>
            <input
              className={styles.searchInput}
              placeholder="Search to filter items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <VirtualizedTable
            rows={filteredRows}
            columns={tableColumns}
            wrapperClassName={styles.tableWrapper}
            rowKey={(row) => row.key}
            rowClassName={(row) => `${styles.row} ${row.key === data?.selectedKey ? styles.rowActive : ''}`}
            onRowClick={(row) => requestLoad({ selection: currentSelection(data, chartData, resolvedBrushWindow), selectedKey: row.key })}
            emptyState={<div className={styles.empty}>No matching rows</div>}
            ariaLabel="Failures results"
            gridTemplateColumns="minmax(320px, 2.2fr) minmax(140px, 0.8fr) minmax(120px, 0.8fr) minmax(140px, 0.8fr)"
          />
        </div>

        <div className={styles.side}>
          <div className={styles.detailHeader}>
            <div className={styles.detailTitle}>{selectedRow?.label ?? 'No selection'}</div>
            <div className={styles.detailMeta}>
              <span>Failed: {formatCount(selectedRow?.failedCount ?? 0)}</span>
              <span>Total: {formatCount(selectedRow?.totalCount ?? 0)}</span>
              <span>Rate: {formatPercent(selectedRow?.failureRate ?? 0)}</span>
            </div>
          </div>

          {(data?.cards ?? []).map(card => (
            <div key={card.title} className={styles.detailCard}>
              <div className={styles.detailCardTitle}>{card.title}</div>
              {card.items.length > 0 ? (
                <div className={styles.detailList}>
                  {card.items.map(item => (
                    <div key={`${card.title}-${item.label}`} className={styles.detailRow}>
                      <div className={styles.detailLabel}>{item.label}</div>
                      <div className={styles.barWrap}>
                        <div className={styles.bar} style={{ width: `${Math.max(24, Math.min(330, item.count * 8))}px` }} />
                        <span>{formatCount(item.count)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.empty}>{card.emptyText}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

function rate(failedCount: number, totalCount: number): number {
  return totalCount > 0 ? failedCount / totalCount : 0;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatAxisTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getDefaultBrushWindow(length: number): BrushWindow {
  if (length <= 1) return { startIndex: 0, endIndex: 0 };
  const visiblePoints = Math.max(8, Math.floor(length * 0.25));
  return { startIndex: Math.max(0, length - visiblePoints), endIndex: length - 1 };
}

function selectionFromBrush(chart: FailuresChartPoint[], brushWindow: BrushWindow | null): FailuresSelection | undefined {
  if (!brushWindow || chart.length === 0) return undefined;
  const start = chart[brushWindow.startIndex];
  const end = chart[brushWindow.endIndex];
  if (!start || !end) return undefined;
  return { from: start.timestamp, to: end.timestamp };
}

function currentSelection(data: FailuresData | null, chart: Array<{ timestamp: string }>, brushWindow: BrushWindow | null): FailuresSelection | undefined {
  return data?.appliedSelection ?? selectionFromBrush(chart as FailuresChartPoint[], brushWindow);
}

function getBrushWindowFromSelection(chart: FailuresChartPoint[], selection?: FailuresSelection): BrushWindow | null {
  if (!selection || chart.length === 0) return null;
  const startIndex = chart.findIndex(point => point.timestamp === selection.from);
  const endIndex = chart.findIndex(point => point.timestamp === selection.to);
  if (startIndex === -1 || endIndex === -1) return null;
  return { startIndex, endIndex };
}

function formatSelectionLabel(selection?: FailuresSelection): string {
  if (!selection) return 'Showing full selected time range';
  const from = new Date(selection.from);
  const to = new Date(selection.to);
  return `Showing ${from.toLocaleString()} – ${to.toLocaleString()}`;
}

const FailuresTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--vscode-editorHoverWidget-background)', border: '1px solid var(--vscode-panel-border)', padding: '8px 10px', fontSize: 12 }}>
      <div style={{ marginBottom: 6 }}>{label}</div>
      {payload.map((entry: any) => (
        <div key={entry.dataKey} style={{ color: entry.color }}>
          {entry.name ?? entry.dataKey}: {formatCount(Number(entry.value ?? 0))}
        </div>
      ))}
    </div>
  );
};