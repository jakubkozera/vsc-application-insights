import * as vscode from 'vscode';
import { Logger } from '../logging/logger';
import { ConnectionStore } from '../state/connectionStore';
import { QueryService } from './queryService';

export interface AvailabilityHealthState {
  hasHealthChecks: boolean;
  failingCount: number;
  checkedAt: string;
}

const CHECK_INTERVAL_MS = 15 * 60 * 1000;
const HEALTH_CHECK_QUERY = `
availabilityResults
| summarize total = count(), failing = countif(success != 1)
| project total, failing
`.trim();

export class AvailabilityHealthMonitor implements vscode.Disposable {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;
  private readonly states = new Map<string, AvailabilityHealthState>();
  private refreshQueue: Promise<void> = Promise.resolve();
  private intervalHandle: NodeJS.Timeout | undefined;
  private disposed = false;
  private enabled = false;
  private refreshToken = 0;

  constructor(
    private readonly store: ConnectionStore,
    private readonly queryService: QueryService
  ) {}

  start(): void {
    if (this.disposed || this.enabled) {
      return;
    }

    this.enabled = true;
    this.intervalHandle = setInterval(() => {
      void this.refreshNow();
    }, CHECK_INTERVAL_MS);

    void this.refreshNow();
  }

  stop(): void {
    if (!this.enabled && !this.intervalHandle) {
      return;
    }

    this.enabled = false;
    this.refreshToken += 1;

    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
    }

    if (this.states.size > 0) {
      this.states.clear();
      this._onDidChange.fire();
    }
  }

  getState(connectionId: string): AvailabilityHealthState | undefined {
    return this.states.get(connectionId);
  }

  getTotalFailingCount(): number {
    let total = 0;
    for (const state of this.states.values()) {
      if (state.hasHealthChecks) {
        total += state.failingCount;
      }
    }
    return total;
  }

  async refreshNow(): Promise<void> {
    if (this.disposed || !this.enabled) {
      return;
    }

    const token = this.refreshToken;
    this.refreshQueue = this.refreshQueue
      .then(() => this.refreshInternal(token))
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        Logger.error('[AvailabilityHealthMonitor] Refresh failed', message);
      });

    return this.refreshQueue;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.stop();
    this._onDidChange.dispose();
  }

  private async refreshInternal(token: number): Promise<void> {
    if (this.disposed || !this.enabled || token !== this.refreshToken) {
      return;
    }

    const connections = this.store.list().filter(connection => connection.resourceType === 'appInsights');
    const nextStates = new Map<string, AvailabilityHealthState>();

    await Promise.all(connections.map(async connection => {
      try {
        const result = await this.queryService.runQuery(connection.id, HEALTH_CHECK_QUERY, { range: '24h' });
        const row = result.rows[0] ?? {};
        const total = Number(row.total ?? 0);
        const failing = Number(row.failing ?? 0);

        nextStates.set(connection.id, {
          hasHealthChecks: total > 0,
          failingCount: total > 0 ? failing : 0,
          checkedAt: new Date().toISOString()
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        Logger.error(`[AvailabilityHealthMonitor] Health check query failed for ${connection.displayName}`, message);
      }
    }));

    if (this.disposed || !this.enabled || token !== this.refreshToken) {
      return;
    }

    const changed = !mapsEqual(this.states, nextStates);
    this.states.clear();
    for (const [connectionId, state] of nextStates.entries()) {
      this.states.set(connectionId, state);
    }

    if (changed) {
      this._onDidChange.fire();
    }
  }
}

function mapsEqual(
  left: Map<string, AvailabilityHealthState>,
  right: Map<string, AvailabilityHealthState>
): boolean {
  if (left.size !== right.size) {
    return false;
  }

  for (const [key, leftState] of left.entries()) {
    const rightState = right.get(key);
    if (!rightState) {
      return false;
    }

    if (
      leftState.hasHealthChecks !== rightState.hasHealthChecks ||
      leftState.failingCount !== rightState.failingCount
    ) {
      return false;
    }
  }

  return true;
}