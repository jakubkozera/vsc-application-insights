import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import { ConnectionMetadata } from '../models/connection';

const STATE_KEY = 'appInsightsExplorer.connections';
const SECRET_PREFIX = 'appInsightsExplorer.secret.';
const ACTIVE_KEY = 'appInsightsExplorer.activeConnection';

export class ConnectionStore {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  constructor(private readonly ctx: vscode.ExtensionContext) {}

  list(): ConnectionMetadata[] {
    return this.ctx.globalState.get<ConnectionMetadata[]>(STATE_KEY, []);
  }

  get(id: string): ConnectionMetadata | undefined {
    return this.list().find(c => c.id === id);
  }

  async add(meta: Omit<ConnectionMetadata, 'id' | 'createdAt'>, secret?: string): Promise<ConnectionMetadata> {
    const full: ConnectionMetadata = {
      ...meta,
      id: randomUUID(),
      createdAt: new Date().toISOString()
    };
    const list = this.list();
    list.push(full);
    await this.ctx.globalState.update(STATE_KEY, list);
    if (secret) {
      await this.ctx.secrets.store(SECRET_PREFIX + full.id, secret);
    }
    this._onDidChange.fire();
    return full;
  }

  async update(meta: ConnectionMetadata, secret?: string): Promise<void> {
    const list = this.list();
    const idx = list.findIndex(c => c.id === meta.id);
    if (idx === -1) throw new Error('Connection not found');
    list[idx] = meta;
    await this.ctx.globalState.update(STATE_KEY, list);
    if (secret !== undefined) {
      await this.ctx.secrets.store(SECRET_PREFIX + meta.id, secret);
    }
    this._onDidChange.fire();
  }

  async remove(id: string): Promise<void> {
    const list = this.list().filter(c => c.id !== id);
    await this.ctx.globalState.update(STATE_KEY, list);
    await this.ctx.secrets.delete(SECRET_PREFIX + id);
    if (this.getActiveId() === id) {
      await this.setActive(undefined);
    }
    this._onDidChange.fire();
  }

  async getSecret(id: string): Promise<string | undefined> {
    return this.ctx.secrets.get(SECRET_PREFIX + id);
  }

  getActiveId(): string | undefined {
    return this.ctx.globalState.get<string>(ACTIVE_KEY);
  }

  getActive(): ConnectionMetadata | undefined {
    const id = this.getActiveId();
    return id ? this.get(id) : this.list()[0];
  }

  async setActive(id: string | undefined): Promise<void> {
    await this.ctx.globalState.update(ACTIVE_KEY, id);
    this._onDidChange.fire();
  }

  async touchLastUsed(id: string): Promise<void> {
    const list = this.list();
    const item = list.find(c => c.id === id);
    if (!item) return;
    item.lastUsedAt = new Date().toISOString();
    await this.ctx.globalState.update(STATE_KEY, list);
  }
}
