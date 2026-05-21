import type { TokenCredential } from '@azure/core-auth';
import { LogsQueryClient } from '@azure/monitor-query';
import { ConnectionMetadata } from '../models/connection';
import { ConnectionStore } from '../state/connectionStore';
import { Logger } from '../logging/logger';

interface CachedClient {
  logsClient: LogsQueryClient | null;
  credential?: TokenCredential;
  /** For API key auth, store the key directly */
  apiKey?: string;
}

export class ClientFactory {
  private cache = new Map<string, CachedClient>();

  constructor(private store: ConnectionStore) {}

  async getLogsClient(connectionId: string): Promise<LogsQueryClient> {
    const entry = await this.get(connectionId);
    if (!entry.logsClient) {
      throw new Error('This connection uses API key auth — use getApiKey() instead');
    }
    return entry.logsClient;
  }

  async getApiKey(connectionId: string): Promise<string | undefined> {
    const entry = await this.get(connectionId);
    return entry.apiKey;
  }

  private async get(connectionId: string): Promise<CachedClient> {
    const cached = this.cache.get(connectionId);
    if (cached) return cached;

    const meta = this.store.get(connectionId);
    if (!meta) throw new Error(`Connection ${connectionId} not found`);

    Logger.info(`[ClientFactory] Creating client for "${meta.displayName}" (${meta.authMode}, ${meta.resourceType})`);

    let entry: CachedClient;

    if (meta.authMode === 'aad') {
      const credential = await this.createCredential(meta);
      const logsClient = new LogsQueryClient(credential);
      entry = { logsClient, credential };
    } else {
      const apiKey = await this.store.getSecret(connectionId);
      if (!apiKey) throw new Error('Missing API key secret');
      Logger.info(`[ClientFactory] Using API key auth for "${meta.displayName}"`);
      entry = { logsClient: null, apiKey };
    }

    this.cache.set(connectionId, entry);
    void this.store.touchLastUsed(connectionId);
    return entry;
  }

  private async createCredential(meta: ConnectionMetadata): Promise<TokenCredential> {
    const { VsCodeCredential } = await import('./vsCodeCredential');
    return new VsCodeCredential(meta.tenantId);
  }

  invalidate(connectionId: string): void {
    this.cache.delete(connectionId);
  }

  dispose(): void {
    this.cache.clear();
  }
}
