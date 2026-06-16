import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { IconRefresh } from '@tabler/icons-react';
import { Button, Dropdown, LoadingOverlay } from '@shared/components';
import { useVSCodeMessaging } from '@shared/hooks';
import styles from './Availability.module.css';

interface InitData {
  connectionId: string;
  connectionName: string;
}

interface AvailabilityTestResult {
  testName: string;
  availability20m: number;
  availabilityPct: number;
  avgDurationMs: number;
  lastTimestamp: string;
  successCount: number;
  failedCount: number;
  totalCount: number;
}

interface AvailabilityChartPoint {
  timestamp: string;
  availabilityPct: number;
  successCount: number;
  totalCount: number;
}

interface AvailabilityViewData {
  tests: AvailabilityTestResult[];
  totalSuccessful: number;
  totalFailed: number;
  chart: AvailabilityChartPoint[];
  selectedTestName?: string;
  selectedChart?: AvailabilityChartPoint[];
}

type IncomingMessage =
  | { command: 'init'; data: InitData }
  | { command: 'availabilityData'; data: AvailabilityViewData }
  | { command: 'availabilityError'; error: string };

type OutgoingMessage =
  | { command: 'webviewReady' }
  | { command: 'loadAvailability'; timeRange: { range: string }; selectedTestName?: string };

const TIME_RANGES = [
  { label: 'Last 30 min', value: '30m' },
  { label: 'Last 1 hour', value: '1h' },
  { label: 'Last 6 hours', value: '6h' },
  { label: 'Last 24 hours', value: '24h' },
  { label: 'Last 7 days', value: '7d' },
];

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} sec`;
}

function formatTimestamp(ts: string): string {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch {
    return ts;
  }
}

function formatAxisTime(ts: string): string {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return ts;
  }
}

function getAvailabilityClass(pct: number): string {
  if (pct >= 95) return styles.availHigh;
  if (pct >= 70) return styles.availMid;
  return styles.availLow;
}

function getStatusDotClass(pct: number, noData: boolean): string {
  if (noData) return styles.statusGray;
  if (pct >= 95) return styles.statusGreen;
  if (pct >= 70) return styles.statusYellow;
  return styles.statusRed;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const pct: number = payload[0]?.value ?? 0;
  const total: number = payload[0]?.payload?.totalCount ?? 0;
  const success: number = payload[0]?.payload?.successCount ?? 0;
  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipTime}>{label}</div>
      <div className={`${styles.tooltipPct} ${getAvailabilityClass(pct)}`}>
        {pct.toFixed(2)}%
      </div>
      <div className={styles.tooltipDetail}>{success} / {total} passed</div>
    </div>
  );
};

export function App() {
  const { postMessage, subscribe } = useVSCodeMessaging<IncomingMessage, OutgoingMessage>();

  const [initData, setInitData] = useState<InitData | null>(null);
  const [loading, setLoading] = useState(false);
  const [chartLoading, setChartLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AvailabilityViewData | null>(null);
  const [timeRange, setTimeRange] = useState('24h');
  const [selectedTest, setSelectedTest] = useState<string | null>(null);
  const [failedDrillDown, setFailedDrillDown] = useState(false);

  const load = useCallback((range: string, testName?: string) => {
    if (testName !== undefined) {
      setChartLoading(true);
    } else {
      setLoading(true);
    }
    setError(null);
    postMessage({
      command: 'loadAvailability',
      timeRange: { range },
      selectedTestName: testName,
    });
  }, [postMessage]);

  useEffect(() => {
    const unsub = subscribe((msg) => {
      if (msg.command === 'init') {
        setInitData(msg.data);
        load('24h');
      } else if (msg.command === 'availabilityData') {
        setData(msg.data);
        setLoading(false);
        setChartLoading(false);
      } else if (msg.command === 'availabilityError') {
        setError(msg.error);
        setLoading(false);
        setChartLoading(false);
      }
    });
    postMessage({ command: 'webviewReady' });
    return unsub;
  }, []);

  const handleTimeRangeChange = (range: string) => {
    setTimeRange(range);
    setSelectedTest(null);
    setFailedDrillDown(false);
    load(range);
  };

  const handleRefresh = () => {
    load(timeRange, selectedTest ?? undefined);
  };

  const handleTestClick = (testName: string) => {
    const next = selectedTest === testName ? null : testName;
    setSelectedTest(next);
    load(timeRange, next ?? undefined);
  };

  const displayChart = useMemo((): Array<AvailabilityChartPoint & { label: string }> => {
    const points = (selectedTest && data?.selectedChart) ? data.selectedChart : (data?.chart ?? []);
    return points.map(p => ({ ...p, label: formatAxisTime(p.timestamp) }));
  }, [data, selectedTest]);

  const total = (data?.totalSuccessful ?? 0) + (data?.totalFailed ?? 0);
  const successBarWidth = total > 0 ? (data!.totalSuccessful / total) * 100 : 0;
  const failedBarWidth = total > 0 ? (data!.totalFailed / total) * 100 : 0;

  const chartTitle = selectedTest
    ? `Availability over time — ${selectedTest}`
    : 'Availability over time — Overall';

  return (
    <div className={styles.container}>
      <LoadingOverlay visible={loading} message="Loading availability data…" />

      {/* Topbar */}
      <div className={styles.topbar}>
        <div className={styles.titleBlock}>
          <span className={styles.title}>Availability</span>
          {initData && <span className={styles.subtitle}>{initData.connectionName}</span>}
        </div>
        <div className={styles.topbarRight}>
          <Dropdown options={TIME_RANGES} value={timeRange} onChange={handleTimeRangeChange} />
          <Button variant="icon" onClick={handleRefresh} title="Refresh">
            <IconRefresh size={16} />
          </Button>
        </div>
      </div>

      {/* Main layout: chart + summary side-by-side */}
      <div className={styles.overviewRow}>
        {/* Chart */}
        <div className={styles.chartPanel}>
          <div className={styles.chartHeader}>
            <span className={styles.chartTitle}>{chartTitle}</span>
            {chartLoading && <span className={styles.chartLoadingBadge}>updating…</span>}
            {selectedTest && (
              <button className={styles.clearSelection} onClick={() => { setSelectedTest(null); load(timeRange); }}>
                ✕ Clear selection
              </button>
            )}
          </div>
          <div className={styles.chartArea}>
            {!loading && displayChart.length === 0 ? (
              <div className={styles.chartEmpty}>No data for selected range</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={displayChart} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="availGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#e8a000" stopOpacity={0.7} />
                      <stop offset="95%" stopColor="#e8a000" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--vscode-panel-border)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: 'var(--vscode-descriptionForeground)' }}
                    tickLine={false}
                    interval="preserveStartEnd"
                    minTickGap={60}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                    tick={{ fontSize: 10, fill: 'var(--vscode-descriptionForeground)' }}
                    tickLine={false}
                    axisLine={false}
                    width={48}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="availabilityPct"
                    stroke="#e8a000"
                    strokeWidth={1.5}
                    fill="url(#availGrad)"
                    dot={false}
                    activeDot={{ r: 4, fill: '#e8a000' }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Summary card */}
        {data && (
          <div className={styles.summaryPanel}>
            <div className={styles.summaryCardTitle}>Overall</div>
            <div className={styles.summaryCard}>
              <div className={styles.summaryCardSubtitle}>Availability Results</div>
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}>Successful</span>
                <div className={styles.summaryBar2}>
                  <div className={`${styles.summaryBarFill} ${styles.fillSuccess}`} style={{ width: `${successBarWidth}%` }} />
                </div>
                <span className={`${styles.summaryCount} ${styles.availHigh}`}>{data.totalSuccessful}</span>
              </div>
              <div
                className={`${styles.summaryRow} ${data.totalFailed > 0 ? styles.summaryRowClickable : ''} ${failedDrillDown ? styles.summaryRowActive : ''}`}
                onClick={() => data.totalFailed > 0 && setFailedDrillDown(v => !v)}
                title={data.totalFailed > 0 ? 'Click to see failed tests' : undefined}
              >
                <span className={styles.summaryLabel}>Failed</span>
                <div className={styles.summaryBar2}>
                  <div className={`${styles.summaryBarFill} ${styles.fillFailed}`} style={{ width: `${failedBarWidth}%` }} />
                </div>
                <span className={`${styles.summaryCount} ${styles.availLow}`}>{data.totalFailed}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tests table */}
      <div className={styles.content}>
        {error && <div className={styles.errorBanner}>{error}</div>}

        {!loading && data && data.tests.length === 0 && (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>○</div>
            <div className={styles.emptyTitle}>No availability tests configured</div>
            <div className={styles.emptyText}>
              No availability tests were found for this Application Insights resource in the selected time range.
              Configure availability tests in the Azure Portal to monitor your endpoints.
            </div>
          </div>
        )}

        {!loading && data && data.tests.length > 0 && (() => {
          const rows = failedDrillDown
            ? data.tests.filter(t => t.failedCount > 0)
            : data.tests;

          return (
            <div className={styles.tableWrapper}>
              <div className={styles.sectionTitle}>
                {failedDrillDown ? (
                  <>
                    <span className={styles.failedDrillTitle}>Failed tests</span>
                    <span className={styles.sectionHint}> — {rows.length} test{rows.length !== 1 ? 's' : ''} with failures</span>
                    <button
                      className={styles.closeDrillDown}
                      onClick={() => setFailedDrillDown(false)}
                      title="Close"
                    >
                      ✕ Close
                    </button>
                  </>
                ) : (
                  <>
                    Select availability test
                    <span className={styles.sectionHint}> — click a row to drill into its timeline</span>
                  </>
                )}
              </div>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Availability Test</th>
                    <th>Last 20 Min</th>
                    <th>Availability</th>
                    {failedDrillDown && <th>Failed</th>}
                    <th>Avg Duration</th>
                    <th>Last Run</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((test) => {
                    const noData20m = test.availability20m < 0;
                    const noData = test.totalCount === 0;
                    const isSelected = !failedDrillDown && selectedTest === test.testName;
                    return (
                      <tr
                        key={test.testName}
                        className={`${styles.tableRow} ${isSelected ? styles.tableRowSelected : ''}`}
                        onClick={() => !failedDrillDown && handleTestClick(test.testName)}
                        title={failedDrillDown ? undefined : 'Click to filter timeline to this test'}
                        style={failedDrillDown ? { cursor: 'default' } : undefined}
                      >
                        <td>
                          <div className={styles.testNameCell}>
                            <div
                              className={`${styles.statusDot} ${getStatusDotClass(test.availabilityPct, noData)}`}
                              title={noData ? 'No data' : `${test.availabilityPct.toFixed(2)}% available`}
                            />
                            {test.testName}
                          </div>
                        </td>
                        <td>
                          {noData20m ? (
                            <span className={styles.availNone}>—</span>
                          ) : (
                            <span className={`${styles.availBadge} ${getAvailabilityClass(test.availability20m)}`}>
                              {test.availability20m.toFixed(2)}%
                            </span>
                          )}
                        </td>
                        <td>
                          {noData ? (
                            <span className={styles.availNone}>—</span>
                          ) : (
                            <span className={`${styles.availBadge} ${getAvailabilityClass(test.availabilityPct)}`}>
                              {test.availabilityPct.toFixed(2)}%
                            </span>
                          )}
                        </td>
                        {failedDrillDown && (
                          <td>
                            <span className={styles.availLow}>{test.failedCount.toLocaleString()}</span>
                            <span className={styles.availNone}> / {test.totalCount.toLocaleString()}</span>
                          </td>
                        )}
                        <td>{test.avgDurationMs > 0 ? formatDuration(test.avgDurationMs) : '—'}</td>
                        <td>{formatTimestamp(test.lastTimestamp)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
