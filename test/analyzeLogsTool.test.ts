import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AnalyzeLogsTool, registerAnalyzeLogsTool } from '../src/tools/analyzeLogsTool';
import { registerQueryCommands } from '../src/commands/queryCommands';
import { ConnectionStore } from '../src/state/connectionStore';
import { QueryService } from '../src/services/queryService';
import { ConnectionMetadata, QueryResult } from '../src/models/connection';

const hosts = vi.hoisted(() => [] as any[]);
vi.mock('../src/webviews/webviewHost', () => ({
  WebviewHost: class {
    post = vi.fn();
    onMessage = (handler: any) => { this.message = handler; return { dispose: vi.fn() }; };
    message: any;
    listeners = new Set<() => void>();
    onDispose = (handler: () => void) => {
      this.listeners.add(handler);
      return { dispose: () => this.listeners.delete(handler) };
    };
    close = () => this.listeners.forEach(handler => handler());
    constructor(_context: any, public options: any) { hosts.push(this); }
  },
}));

const connection: ConnectionMetadata = {
  id: 'prod', displayName: 'Production', resourceId: 'resource',
  resourceType: 'appInsights', authMode: 'aad', createdAt: '2026-10-08',
};
const result: QueryResult = {
  columns: [{ name: 'timestamp', type: 'datetime' }, { name: 'message', type: 'string' }],
  rows: [
    { timestamp: '2026-10-08T12:00:00Z', message: 'Failed request' },
    { timestamp: '2026-10-08T10:00:00Z', message: 'Started request' },
  ],
};

function createToken(): vscode.CancellationToken {
  return { isCancellationRequested: false, onCancellationRequested: vi.fn(() => ({ dispose: vi.fn() })) };
}

function createStore(connections = [connection]): ConnectionStore {
  return { list: () => connections, getActive: () => connection, get: (id: string) => connections.find(meta => meta.id === id) } as ConnectionStore;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('AnalyzeLogsTool', () => {
  beforeEach(() => {
    vi.spyOn(fs.promises, 'mkdtemp').mockResolvedValue(path.join(os.tmpdir(), 'analysis-test'));
    vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);
  });

  it('registers analyze_logs and explains the telemetry-sharing confirmation', () => {
    const register = vi.spyOn(vscode.lm, 'registerTool');
    const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
    registerAnalyzeLogsTool(context, createStore());
    expect(register).toHaveBeenCalledWith('analyze_logs', expect.any(AnalyzeLogsTool));
    expect(context.subscriptions).toHaveLength(1);
    expect(new AnalyzeLogsTool(createStore()).prepareInvocation().confirmationMessages?.message).toContain('share the matching log data');
  });

  it('opens Search on the only connection and returns chronological CSV without opening another chat', async () => {
    const execute = vi.spyOn(vscode.commands, 'executeCommand').mockResolvedValue(result);
    const pick = vi.spyOn(vscode.window, 'showQuickPick');
    const token = createToken();
    const response = await new AnalyzeLogsTool(createStore()).invoke({ input: { search_phrase: ' operation-123 ' }, toolInvocationToken: undefined }, token);
    expect(execute).toHaveBeenCalledExactlyOnceWith('appInsightsExplorer.openQueryEditor', undefined, {
      connectionId: 'prod', searchPhrase: 'operation-123', token,
    });
    expect(pick).not.toHaveBeenCalled();
    const text = (response.content[0] as vscode.LanguageModelTextPart).value;
    expect(text.indexOf('Started request')).toBeLessThan(text.indexOf('Failed request'));
    expect(text).toContain('latest 100 matches');
    expect(text).toContain('analyze-logs.csv');
  });

  it('asks for one connection when multiple exist, highlighting the active connection', async () => {
    const other = { ...connection, id: 'dev', displayName: 'Development' };
    const pick = vi.spyOn(vscode.window, 'showQuickPick').mockResolvedValue({ label: 'Development', connection: other } as any);
    const execute = vi.spyOn(vscode.commands, 'executeCommand').mockResolvedValue(result);
    await new AnalyzeLogsTool(createStore([other, connection])).invoke({ input: { search_phrase: 'failure' }, toolInvocationToken: undefined }, createToken());
    expect(pick.mock.calls[0][0]).toEqual([
      expect.objectContaining({ label: 'Production', description: 'Active connection' }),
      expect.objectContaining({ label: 'Development' }),
    ]);
    expect(execute.mock.calls[0][2]).toEqual(expect.objectContaining({ connectionId: 'dev' }));
  });

  it('cancels when the user dismisses the connection picker', async () => {
    vi.spyOn(vscode.window, 'showQuickPick').mockResolvedValue(undefined);
    const execute = vi.spyOn(vscode.commands, 'executeCommand');
    await expect(new AnalyzeLogsTool(createStore([connection, { ...connection, id: 'dev' }])).invoke({ input: { search_phrase: 'failure' }, toolInvocationToken: undefined }, createToken())).rejects.toThrow('Canceled');
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    { phrase: ' ', connections: [connection], error: 'non-empty search_phrase' },
    { phrase: 'failure', connections: [], error: 'No Application Insights connections' },
  ])('rejects invalid input or missing connections: $error', async ({ phrase, connections, error }) => {
    await expect(new AnalyzeLogsTool(createStore(connections)).invoke({ input: { search_phrase: phrase }, toolInvocationToken: undefined }, createToken())).rejects.toThrow(error);
  });

  it('returns an explicit no-results response without writing a CSV', async () => {
    vi.spyOn(vscode.commands, 'executeCommand').mockResolvedValue({ columns: [], rows: [] });
    const response = await new AnalyzeLogsTool(createStore()).invoke({ input: { search_phrase: 'missing' }, toolInvocationToken: undefined }, createToken());
    expect((response.content[0] as vscode.LanguageModelTextPart).value).toContain('No matching logs found');
    expect(fs.promises.writeFile).not.toHaveBeenCalled();
  });

  it('returns the saved CSV path rather than oversized data when the token budget is exceeded', async () => {
    vi.spyOn(vscode.commands, 'executeCommand').mockResolvedValue(result);
    const response = await new AnalyzeLogsTool(createStore()).invoke({
      input: { search_phrase: 'failure' }, toolInvocationToken: undefined,
      tokenizationOptions: { tokenBudget: 1000, countTokens: async () => 2000 },
    }, createToken());
    const text = (response.content[0] as vscode.LanguageModelTextPart).value;
    expect(text).toContain('Read the full saved CSV');
    expect(text).not.toContain('Started request');
    expect(fs.promises.writeFile).toHaveBeenCalled();
  });

  it('stops before export when cancelled during Search', async () => {
    const token = createToken();
    vi.spyOn(vscode.commands, 'executeCommand').mockImplementation(async () => {
      Object.assign(token, { isCancellationRequested: true });
      return result;
    });
    await expect(new AnalyzeLogsTool(createStore()).invoke({ input: { search_phrase: 'failure' }, toolInvocationToken: undefined }, token)).rejects.toThrow('Canceled');
    expect(fs.promises.writeFile).not.toHaveBeenCalled();
  });
});

describe('Automated Search command', () => {
  let openSearch: (...args: any[]) => Promise<QueryResult>;
  const runQuery = vi.fn();

  beforeEach(() => {
    hosts.length = 0;
    runQuery.mockReset().mockResolvedValue(result);
    vi.spyOn(vscode.commands, 'registerCommand').mockImplementation((name, handler) => {
      if (name === 'appInsightsExplorer.openQueryEditor') openSearch = handler as typeof openSearch;
      return { dispose: vi.fn() };
    });
    registerQueryCommands(
      { subscriptions: [], extensionUri: {} } as any, createStore(), {} as any,
      { runQuery } as unknown as QueryService, {} as any,
      { getLastTimeRange: () => ({ range: '24h' }), setLastTimeRange: vi.fn() } as any,
    );
  });

  it('opens Search with the phrase and returns the same result displayed in the webview', async () => {
    const pending = openSearch(undefined, { connectionId: 'prod', searchPhrase: 'operation-123', token: createToken() });
    expect(hosts[0].options.initData).toEqual(expect.objectContaining({
      initialMode: 'search', initialSearchText: 'operation-123', autoRunSearch: true,
    }));
    await hosts[0].message({ command: 'runQuery', kql: 'generated-search', connectionId: 'prod', timeRange: { range: '24h' }, analysisRequest: true });
    await expect(pending).resolves.toEqual(result);
    expect(runQuery).toHaveBeenCalledWith('prod', 'generated-search', { range: '24h' });
    expect(hosts[0].post).toHaveBeenCalledWith({ command: 'queryResult', data: result });
  });

  it('propagates query errors to the tool and the Search view', async () => {
    runQuery.mockRejectedValue(new Error('Azure unavailable'));
    const pending = openSearch(undefined, { connectionId: 'prod', searchPhrase: 'failure', token: createToken() });
    const rejected = expect(pending).rejects.toThrow('Azure unavailable');
    await hosts[0].message({ command: 'runQuery', kql: 'query', analysisRequest: true });
    await rejected;
    expect(hosts[0].post).toHaveBeenCalledWith({ command: 'queryError', error: 'Azure unavailable' });
  });

  it('cancels when Search is closed before results arrive', async () => {
    const pending = openSearch(undefined, { connectionId: 'prod', searchPhrase: 'failure', token: createToken() });
    const rejected = expect(pending).rejects.toThrow('Canceled');
    hosts[0].close();
    await rejected;
  });

  it('rejects when the webview never starts its query', async () => {
    vi.useFakeTimers();
    const pending = openSearch(undefined, { connectionId: 'prod', searchPhrase: 'failure', token: createToken() });
    const rejected = expect(pending).rejects.toThrow('Search timed out');
    await vi.advanceTimersByTimeAsync(120_000);
    await rejected;
  });

  it('cancels during tool invocation and disposes the cancellation listener', async () => {
    const token = createToken();
    const pending = openSearch(undefined, { connectionId: 'prod', searchPhrase: 'failure', token });
    const rejected = expect(pending).rejects.toThrow('Canceled');
    const subscription = vi.mocked(token.onCancellationRequested).mock.results[0].value;
    vi.mocked(token.onCancellationRequested).mock.calls[0][0]();
    await rejected;
    expect(subscription.dispose).toHaveBeenCalled();
  });
});