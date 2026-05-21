import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import { SavedQuery } from '../models/connection';

const STATE_KEY = 'appInsightsExplorer.savedQueries';

export class QueryStore {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  constructor(private readonly ctx: vscode.ExtensionContext) {}

  list(): SavedQuery[] {
    return this.ctx.globalState.get<SavedQuery[]>(STATE_KEY, []);
  }

  get(id: string): SavedQuery | undefined {
    return this.list().find(q => q.id === id);
  }

  async add(name: string, kql: string, connectionId?: string): Promise<SavedQuery> {
    const query: SavedQuery = {
      id: randomUUID(),
      name,
      kql,
      connectionId,
      createdAt: new Date().toISOString()
    };
    const list = this.list();
    list.push(query);
    await this.ctx.globalState.update(STATE_KEY, list);
    this._onDidChange.fire();
    return query;
  }

  async remove(id: string): Promise<void> {
    const list = this.list().filter(q => q.id !== id);
    await this.ctx.globalState.update(STATE_KEY, list);
    this._onDidChange.fire();
  }

  async update(query: SavedQuery): Promise<void> {
    const list = this.list();
    const idx = list.findIndex(q => q.id === query.id);
    if (idx === -1) throw new Error('Query not found');
    list[idx] = query;
    await this.ctx.globalState.update(STATE_KEY, list);
    this._onDidChange.fire();
  }
}
