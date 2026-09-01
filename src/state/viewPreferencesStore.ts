import * as vscode from 'vscode';
import { TimeRangeValue } from '../models/connection';

const STATE_KEY = 'appInsightsExplorer.viewPreferences';

interface ViewPreferencesData {
  lastTimeRangeByView: Record<string, TimeRangeValue>;
}

/** Remembers per-view UI selections (e.g. time range) across sessions. */
export class ViewPreferencesStore {
  constructor(private readonly ctx: vscode.ExtensionContext) {}

  private getData(): ViewPreferencesData {
    return this.ctx.globalState.get<ViewPreferencesData>(STATE_KEY, { lastTimeRangeByView: {} });
  }

  private async setData(data: ViewPreferencesData): Promise<void> {
    await this.ctx.globalState.update(STATE_KEY, data);
  }

  getLastTimeRange(viewKey: string): TimeRangeValue | undefined {
    return this.getData().lastTimeRangeByView[viewKey];
  }

  async setLastTimeRange(viewKey: string, timeRange: TimeRangeValue): Promise<void> {
    const data = this.getData();
    data.lastTimeRangeByView = { ...data.lastTimeRangeByView, [viewKey]: timeRange };
    await this.setData(data);
  }
}
