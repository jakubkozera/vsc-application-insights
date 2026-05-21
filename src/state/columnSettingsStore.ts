import * as vscode from 'vscode';
import { randomUUID } from 'crypto';

const STATE_KEY = 'appInsightsExplorer.columnSettings';

export interface ColumnPreset {
  id: string;
  name: string;
  /** Column names in order. Only these columns are shown. */
  columns: string[];
  createdAt: string;
}

export interface ColumnSettingsData {
  presets: ColumnPreset[];
}

export class ColumnSettingsStore {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  constructor(private readonly ctx: vscode.ExtensionContext) {}

  private getData(): ColumnSettingsData {
    return this.ctx.globalState.get<ColumnSettingsData>(STATE_KEY, { presets: [] });
  }

  private async setData(data: ColumnSettingsData): Promise<void> {
    await this.ctx.globalState.update(STATE_KEY, data);
    this._onDidChange.fire();
  }

  listPresets(): ColumnPreset[] {
    return this.getData().presets;
  }

  getPreset(id: string): ColumnPreset | undefined {
    return this.getData().presets.find(p => p.id === id);
  }

  async savePreset(name: string, columns: string[]): Promise<ColumnPreset> {
    const data = this.getData();
    const existing = data.presets.find(p => p.name === name);
    if (existing) {
      existing.columns = columns;
      await this.setData(data);
      return existing;
    }
    const preset: ColumnPreset = {
      id: randomUUID(),
      name,
      columns,
      createdAt: new Date().toISOString(),
    };
    data.presets.push(preset);
    await this.setData(data);
    return preset;
  }

  async deletePreset(id: string): Promise<void> {
    const data = this.getData();
    data.presets = data.presets.filter(p => p.id !== id);
    await this.setData(data);
  }

  async updatePreset(id: string, columns: string[]): Promise<void> {
    const data = this.getData();
    const preset = data.presets.find(p => p.id === id);
    if (!preset) throw new Error('Preset not found');
    preset.columns = columns;
    await this.setData(data);
  }
}
